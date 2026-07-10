use super::*;
use crate::workspace::forwards::ForwardingWorkerResult;

// Keep tab responsibilities in real modules while preserving WorkspaceApp's API.
mod create;
mod detach;
mod helpers;
mod navigation;
mod nodes;
mod nodes_reconnect_helpers;
mod render;
mod state;
