// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

use super::{GpuDevice, GpuProcess, GpuSnapshot, GpuSnapshotStatus};

const GPU_TRAILING_FIELD_COUNT: usize = 10;

pub fn parse_gpu_snapshot(output: &str, timestamp_ms: u64) -> GpuSnapshot {
    let status_value = section(output, "NVIDIA_STATUS")
        .and_then(|value| value.lines().find(|line| !line.trim().is_empty()))
        .map(str::trim);
    let mut devices = section(output, "NVIDIA_GPUS")
        .into_iter()
        .flat_map(str::lines)
        .filter_map(parse_device)
        .collect::<Vec<_>>();
    let mut processes = section(output, "NVIDIA_PROCESSES")
        .into_iter()
        .flat_map(str::lines)
        .filter_map(parse_process)
        .collect::<Vec<_>>();
    devices.sort_by_key(|device| device.index);
    processes.sort_by(|left, right| {
        left.gpu_uuid
            .cmp(&right.gpu_uuid)
            .then_with(|| left.pid.cmp(&right.pid))
    });

    let query_exit = section(output, "NVIDIA_GPU_QUERY_EXIT")
        .and_then(|value| value.lines().find(|line| !line.trim().is_empty()))
        .and_then(|value| value.trim().parse::<i32>().ok());
    let status = match status_value {
        Some("unsupported") => GpuSnapshotStatus::Unsupported,
        Some("unavailable") => GpuSnapshotStatus::Unavailable,
        Some("available") if query_exit.is_some_and(|exit| exit != 0) => {
            let message = error_message(output);
            if message
                .to_ascii_lowercase()
                .contains("no devices were found")
            {
                GpuSnapshotStatus::NoDevices
            } else {
                GpuSnapshotStatus::Error(message)
            }
        }
        Some("available") if devices.is_empty() => GpuSnapshotStatus::NoDevices,
        Some("available") => GpuSnapshotStatus::Available,
        _ => GpuSnapshotStatus::Unknown,
    };

    GpuSnapshot {
        timestamp_ms,
        status,
        devices,
        processes,
    }
}

fn parse_device(line: &str) -> Option<GpuDevice> {
    let fields = line.split(',').map(str::trim).collect::<Vec<_>>();
    if fields.len() < 4 + GPU_TRAILING_FIELD_COUNT {
        return None;
    }
    let trailing_start = fields.len() - GPU_TRAILING_FIELD_COUNT;
    let name = fields[3..trailing_start].join(", ");
    let trailing = &fields[trailing_start..];

    Some(GpuDevice {
        index: fields[0].parse().ok()?,
        uuid: required_text(fields[1])?,
        pci_bus_id: required_text(fields[2])?,
        name: required_text(&name)?,
        driver_version: optional_text(trailing[0]),
        performance_state: optional_text(trailing[1]),
        utilization_percent: optional_number(trailing[2]),
        memory_utilization_percent: optional_number(trailing[3]),
        memory_used: optional_mib(trailing[4]),
        memory_total: optional_mib(trailing[5]),
        temperature_celsius: optional_number(trailing[6]),
        power_draw_watts: optional_number(trailing[7]),
        power_limit_watts: optional_number(trailing[8]),
        fan_speed_percent: optional_number(trailing[9]),
    })
}

fn parse_process(line: &str) -> Option<GpuProcess> {
    let fields = line.split(',').map(str::trim).collect::<Vec<_>>();
    if fields.len() < 4 {
        return None;
    }
    let process_name = fields[2..fields.len() - 1].join(", ");
    Some(GpuProcess {
        gpu_uuid: required_text(fields[0])?,
        pid: fields[1].parse().ok()?,
        process_name: required_text(&process_name)?,
        used_memory: optional_mib(fields[fields.len() - 1]),
    })
}

fn section<'a>(output: &'a str, marker: &str) -> Option<&'a str> {
    let marker = format!("==={marker}===");
    let start = output.find(&marker)? + marker.len();
    let rest = output[start..].trim_start_matches(['\r', '\n']);
    let end = rest.find("===").unwrap_or(rest.len());
    Some(rest[..end].trim())
}

fn required_text(value: &str) -> Option<String> {
    optional_text(value).filter(|value| !value.is_empty())
}

fn optional_text(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() || is_unavailable_value(value) {
        None
    } else {
        Some(value.to_string())
    }
}

fn optional_number(value: &str) -> Option<f64> {
    if is_unavailable_value(value) {
        return None;
    }
    value
        .trim()
        .trim_end_matches('%')
        .trim()
        .parse::<f64>()
        .ok()
}

fn optional_mib(value: &str) -> Option<u64> {
    let mib = optional_number(value)?;
    Some((mib.max(0.0) * 1024.0 * 1024.0).round() as u64)
}

fn is_unavailable_value(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "n/a" | "[n/a]" | "not supported" | "not available"
    )
}

fn error_message(output: &str) -> String {
    let message = section(output, "NVIDIA_ERROR")
        .and_then(|value| value.lines().find(|line| !line.trim().is_empty()))
        .map(str::trim)
        .unwrap_or("nvidia-smi query failed");
    message
        .chars()
        .filter(|character| !character.is_control())
        .take(240)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_multiple_gpus_and_processes_with_commas_in_names() {
        let output = r#"===NVIDIA_STATUS===
available
===NVIDIA_GPUS===
0, GPU-a, 00000000:01:00.0, NVIDIA RTX 6000 Ada Generation, 555.42, P0, 97, 40, 12000, 49140, 72, 245.5, 300.0, 55
1, GPU-b, 00000000:02:00.0, NVIDIA Test, Engineering GPU, 555.42, P2, N/A, 2, 512, 46068, 41, N/A, 350.0, N/A
===NVIDIA_GPU_QUERY_EXIT===
0
===NVIDIA_PROCESSES===
GPU-a, 42, python, worker.py, 2048
GPU-b, 84, tritonserver, N/A
===NVIDIA_GPU_END==="#;

        let snapshot = parse_gpu_snapshot(output, 123);

        assert_eq!(snapshot.status, GpuSnapshotStatus::Available);
        assert_eq!(snapshot.devices.len(), 2);
        assert_eq!(snapshot.devices[1].name, "NVIDIA Test, Engineering GPU");
        assert_eq!(snapshot.devices[0].memory_used, Some(12_000 * 1024 * 1024));
        assert_eq!(snapshot.devices[1].utilization_percent, None);
        assert_eq!(snapshot.processes.len(), 2);
        assert_eq!(snapshot.processes[0].process_name, "python, worker.py");
        assert_eq!(snapshot.processes[1].used_memory, None);
    }

    #[test]
    fn distinguishes_unavailable_unsupported_empty_and_failed_states() {
        let unavailable =
            parse_gpu_snapshot("===NVIDIA_STATUS===\nunavailable\n===NVIDIA_GPU_END===", 1);
        let unsupported =
            parse_gpu_snapshot("===NVIDIA_STATUS===\nunsupported\n===NVIDIA_GPU_END===", 1);
        let empty = parse_gpu_snapshot(
            "===NVIDIA_STATUS===\navailable\n===NVIDIA_GPUS===\n===NVIDIA_GPU_QUERY_EXIT===\n0\n===NVIDIA_GPU_END===",
            1,
        );
        let failed = parse_gpu_snapshot(
            "===NVIDIA_STATUS===\navailable\n===NVIDIA_GPUS===\nUnable to determine the device handle\n===NVIDIA_GPU_QUERY_EXIT===\n9\n===NVIDIA_ERROR===\nUnable to determine the device handle\n===NVIDIA_GPU_END===",
            1,
        );
        let no_devices = parse_gpu_snapshot(
            "===NVIDIA_STATUS===\navailable\n===NVIDIA_GPUS===\nNo devices were found\n===NVIDIA_GPU_QUERY_EXIT===\n6\n===NVIDIA_ERROR===\nNo devices were found\n===NVIDIA_GPU_END===",
            1,
        );

        assert_eq!(unavailable.status, GpuSnapshotStatus::Unavailable);
        assert_eq!(unsupported.status, GpuSnapshotStatus::Unsupported);
        assert_eq!(empty.status, GpuSnapshotStatus::NoDevices);
        assert_eq!(no_devices.status, GpuSnapshotStatus::NoDevices);
        assert_eq!(
            failed.status,
            GpuSnapshotStatus::Error("Unable to determine the device handle".into())
        );
    }

    #[test]
    fn ignores_malformed_rows_without_losing_valid_devices() {
        let output = r#"===NVIDIA_STATUS===
available
===NVIDIA_GPUS===
garbage
3, GPU-c, 00000000:03:00.0, NVIDIA L40S, 555.42, P0, 50, 20, 1000, 46068, 55, 100, 350, 40
===NVIDIA_GPU_QUERY_EXIT===
0
===NVIDIA_GPU_END==="#;

        let snapshot = parse_gpu_snapshot(output, 1);

        assert_eq!(snapshot.devices.len(), 1);
        assert_eq!(snapshot.devices[0].index, 3);
    }
}
