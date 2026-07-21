// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

pub const GPU_END_MARKER: &str = "===NVIDIA_GPU_END===";

const GPU_QUERY_FIELDS: &str = concat!(
    "index,uuid,pci.bus_id,name,driver_version,pstate,",
    "utilization.gpu,utilization.memory,memory.used,memory.total,",
    "temperature.gpu,power.draw,power.limit,fan.speed"
);
const GPU_PROCESS_QUERY_FIELDS: &str = "gpu_uuid,pid,process_name,used_gpu_memory";

/// Builds a bounded, locale-independent probe for the dedicated GPU page.
pub fn build_gpu_sample_command(os_type: &str) -> String {
    if !matches!(
        os_type,
        "Linux" | "linux" | "Windows_MinGW" | "Windows_MSYS" | "Windows_Cygwin"
    ) {
        return format!("echo '===NVIDIA_STATUS==='; echo unsupported; echo '{GPU_END_MARKER}'\n");
    }

    format!(
        concat!(
            "echo '===NVIDIA_STATUS==='; ",
            "if ! command -v nvidia-smi >/dev/null 2>&1; then ",
            "echo unavailable; ",
            "else ",
            "echo available; ",
            "echo '===NVIDIA_GPUS==='; ",
            "gpu_output=$(LC_ALL=C nvidia-smi --query-gpu={gpu_fields} --format=csv,noheader,nounits 2>&1); ",
            "gpu_exit=$?; printf '%s\\n' \"$gpu_output\"; ",
            "echo '===NVIDIA_GPU_QUERY_EXIT==='; echo \"$gpu_exit\"; ",
            "if [ \"$gpu_exit\" -eq 0 ]; then ",
            "echo '===NVIDIA_PROCESSES==='; ",
            "LC_ALL=C nvidia-smi --query-compute-apps={process_fields} --format=csv,noheader,nounits 2>/dev/null || true; ",
            "else ",
            "echo '===NVIDIA_ERROR==='; printf '%s\\n' \"$gpu_output\"; ",
            "fi; ",
            "fi; ",
            "echo '{end_marker}'\n"
        ),
        gpu_fields = GPU_QUERY_FIELDS,
        process_fields = GPU_PROCESS_QUERY_FIELDS,
        end_marker = GPU_END_MARKER,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linux_command_queries_devices_and_compute_processes() {
        let command = build_gpu_sample_command("Linux");

        assert!(command.contains("--query-gpu=index,uuid,pci.bus_id,name"));
        assert!(command.contains("--query-compute-apps=gpu_uuid,pid,process_name"));
        assert!(command.contains("LC_ALL=C"));
        assert!(command.contains(GPU_END_MARKER));
    }

    #[test]
    fn unsupported_system_does_not_invoke_nvidia_smi() {
        let command = build_gpu_sample_command("macOS");

        assert!(command.contains("echo unsupported"));
        assert!(!command.contains("--query-gpu"));
    }
}
