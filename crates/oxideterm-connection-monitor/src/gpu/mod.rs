// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

//! NVIDIA GPU monitoring domain contract.
//!
//! This module owns the remote command protocol, parsed snapshot model, and
//! cancellable sampling worker. GPUI-specific state and rendering stay in the
//! application crate.

mod command;
mod model;
mod parser;
mod sampler;

pub use command::{GPU_END_MARKER, build_gpu_sample_command};
pub use model::{
    GpuDevice, GpuProcess, GpuSnapshot, GpuSnapshotStatus, GpuSummary, GpuUpdate,
    gpu_device_row_signature,
};
pub use parser::parse_gpu_snapshot;
pub use sampler::{
    GPU_CHANNEL_OPEN_TIMEOUT, GPU_MAX_OUTPUT_SIZE, GPU_SAMPLE_INTERVAL, GPU_SAMPLE_TIMEOUT,
    GpuSamplingTask, start_gpu_sampling_on,
};
