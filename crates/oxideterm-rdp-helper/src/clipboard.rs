// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

use super::*;

pub(super) struct ClientClipboardBackend {
    input_tx: tokio_mpsc::UnboundedSender<RdpInputEvent>,
    output_tx: ClientRdpOutputSender,
    local_text: Option<String>,
    local_data: Option<RemoteDesktopClipboardData>,
    remote_text_format: Option<ClipboardFormatId>,
    remote_data_format: Option<RdpClipboardDataFormat>,
}

impl fmt::Debug for ClientClipboardBackend {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ClientClipboardBackend")
            .field("has_local_text", &self.local_text.is_some())
            .field("has_local_data", &self.local_data.is_some())
            .field("remote_text_format", &self.remote_text_format)
            .field("remote_data_format", &self.remote_data_format)
            .finish()
    }
}

impl_as_any!(ClientClipboardBackend);

impl ClientClipboardBackend {
    pub(super) fn new(
        input_tx: tokio_mpsc::UnboundedSender<RdpInputEvent>,
        output_tx: ClientRdpOutputSender,
    ) -> Self {
        Self {
            input_tx,
            output_tx,
            local_text: None,
            local_data: None,
            remote_text_format: None,
            remote_data_format: None,
        }
    }

    pub(super) fn set_local_text(&mut self, text: String) {
        self.local_text = Some(text);
        self.local_data = None;
    }

    pub(super) fn set_local_data(&mut self, data: RemoteDesktopClipboardData) {
        self.local_text = None;
        self.local_data = Some(data);
    }

    fn send_clipboard_message(&self, message: ClipboardMessage) {
        let _ = self.input_tx.send(RdpInputEvent::Clipboard(message));
    }

    fn send_local_format_list(&self) {
        let formats = if let Some(data) = self.local_data.as_ref() {
            image_clipboard_formats(data.format)
        } else if self.local_text.is_some() {
            text_clipboard_formats()
        } else {
            Vec::new()
        };
        self.send_clipboard_message(ClipboardMessage::SendInitiateCopy(formats));
    }
}

impl CliprdrBackend for ClientClipboardBackend {
    fn temporary_directory(&self) -> &str {
        RDP_CLIPBOARD_TEMPORARY_DIRECTORY
    }

    fn client_capabilities(&self) -> ClipboardGeneralCapabilityFlags {
        ClipboardGeneralCapabilityFlags::empty()
    }

    fn on_ready(&mut self) {
        // CLIPRDR may become ready after the UI has already supplied local
        // clipboard text. Advertise the cached formats once the channel is
        // usable so the server can request that text immediately.
        self.send_local_format_list();
    }

    fn on_request_format_list(&mut self) {
        // The CLIPRDR initialization sequence requires the client to advertise
        // its current clipboard formats, even when the list is empty.
        self.send_local_format_list();
    }

    fn on_process_negotiated_capabilities(
        &mut self,
        _capabilities: ClipboardGeneralCapabilityFlags,
    ) {
    }

    fn on_remote_copy(&mut self, available_formats: &[ClipboardFormat]) {
        self.remote_text_format = None;
        self.remote_data_format = None;

        if let Some(format) = preferred_image_clipboard_format(available_formats) {
            self.remote_data_format = Some(format);
            self.send_clipboard_message(ClipboardMessage::SendInitiatePaste(format.id));
            return;
        }

        if let Some(format) = preferred_text_clipboard_format(available_formats) {
            self.remote_text_format = Some(format);
            self.send_clipboard_message(ClipboardMessage::SendInitiatePaste(format));
        }
    }

    fn on_format_data_request(&mut self, request: FormatDataRequest) {
        let response = if let Some(data) = self.local_data.as_ref() {
            if let Some(bytes) = encode_local_clipboard_data(data, request.format) {
                FormatDataResponse::new_data(bytes).into_owned()
            } else {
                FormatDataResponse::new_error().into_owned()
            }
        } else {
            match (request.format, self.local_text.as_deref()) {
                (ClipboardFormatId::CF_UNICODETEXT, Some(text)) => {
                    FormatDataResponse::new_unicode_string(text).into_owned()
                }
                (ClipboardFormatId::CF_TEXT, Some(text)) => {
                    FormatDataResponse::new_string(text).into_owned()
                }
                _ => FormatDataResponse::new_error().into_owned(),
            }
        };
        self.send_clipboard_message(ClipboardMessage::SendFormatData(response));
    }

    fn on_format_data_response(&mut self, response: FormatDataResponse<'_>) {
        if response.is_error() {
            return;
        }

        if let Some(format) = self.remote_data_format.take() {
            let data = decode_remote_clipboard_data(format, response.data().to_vec());
            if let Some(data) = data {
                let _ = self.output_tx.send_control(ClientRdpOutput::Event(
                    RemoteDesktopHelperEvent::ClipboardData { data },
                ));
            }
            return;
        }

        let text = match self.remote_text_format.take() {
            Some(ClipboardFormatId::CF_UNICODETEXT) => response.to_unicode_string().ok(),
            Some(ClipboardFormatId::CF_TEXT) => response.to_string().ok(),
            _ => response
                .to_unicode_string()
                .or_else(|_| response.to_string())
                .ok(),
        };
        if let Some(text) = text {
            let _ = self.output_tx.send_control(ClientRdpOutput::Event(
                RemoteDesktopHelperEvent::ClipboardText { text },
            ));
        }
    }

    fn on_file_contents_request(&mut self, _request: FileContentsRequest) {}

    fn on_file_contents_response(&mut self, _response: FileContentsResponse<'_>) {}

    fn on_lock(&mut self, _data_id: LockDataId) {}

    fn on_unlock(&mut self, _data_id: LockDataId) {}
}

pub(super) fn process_clipboard_message(
    active_stage: &mut ActiveStage,
    message: ClipboardMessage,
) -> SessionResult<Vec<ActiveStageOutput>> {
    let Some(svc_messages) = ({
        let Some(cliprdr) = active_stage.get_svc_processor_mut::<CliprdrClient>() else {
            return Ok(Vec::new());
        };
        match message {
            ClipboardMessage::SendInitiateCopy(formats) => Some(
                cliprdr
                    .initiate_copy(&formats)
                    .map_err(|error| session::custom_err!("CLIPRDR initiate copy", error))?,
            ),
            ClipboardMessage::SendFormatData(response) => Some(
                cliprdr
                    .submit_format_data(response)
                    .map_err(|error| session::custom_err!("CLIPRDR format data", error))?,
            ),
            ClipboardMessage::SendInitiatePaste(format) => Some(
                cliprdr
                    .initiate_paste(format)
                    .map_err(|error| session::custom_err!("CLIPRDR initiate paste", error))?,
            ),
            ClipboardMessage::SendFileContentsRequest(request) => Some(
                cliprdr
                    .request_file_contents(request)
                    .map_err(|error| session::custom_err!("CLIPRDR file request", error))?,
            ),
            ClipboardMessage::SendFileContentsResponse(response) => Some(
                cliprdr
                    .submit_file_contents(response)
                    .map_err(|error| session::custom_err!("CLIPRDR file response", error))?,
            ),
            ClipboardMessage::Error(_) => None,
        }
    }) else {
        return Ok(Vec::new());
    };

    let frame = active_stage.process_svc_processor_messages(svc_messages)?;
    response_frame_output(frame)
}

pub(super) fn advertise_local_clipboard_text(
    active_stage: &mut ActiveStage,
    text: String,
) -> SessionResult<Vec<ActiveStageOutput>> {
    let Some(cliprdr) = active_stage.get_svc_processor_mut::<CliprdrClient>() else {
        return Ok(Vec::new());
    };
    if let Some(backend) = cliprdr.downcast_backend_mut::<ClientClipboardBackend>() {
        backend.set_local_text(text);
    }

    // If CLIPRDR is not fully ready yet, the backend keeps the text and the
    // initialization callback will advertise it later.
    let Ok(svc_messages) = cliprdr.initiate_copy(&text_clipboard_formats()) else {
        return Ok(Vec::new());
    };
    let frame = active_stage.process_svc_processor_messages(svc_messages)?;
    response_frame_output(frame)
}

pub(super) fn advertise_local_clipboard_data(
    active_stage: &mut ActiveStage,
    data: RemoteDesktopClipboardData,
) -> SessionResult<Vec<ActiveStageOutput>> {
    let Some(cliprdr) = active_stage.get_svc_processor_mut::<CliprdrClient>() else {
        return Ok(Vec::new());
    };
    let formats = image_clipboard_formats(data.format);
    if let Some(backend) = cliprdr.downcast_backend_mut::<ClientClipboardBackend>() {
        backend.set_local_data(data);
    }

    // If CLIPRDR is not fully ready yet, the backend keeps the data and the
    // initialization callback will advertise it later.
    let Ok(svc_messages) = cliprdr.initiate_copy(&formats) else {
        return Ok(Vec::new());
    };
    let frame = active_stage.process_svc_processor_messages(svc_messages)?;
    response_frame_output(frame)
}

pub(super) fn drive_clipboard_timeouts(
    active_stage: &mut ActiveStage,
) -> SessionResult<Vec<ActiveStageOutput>> {
    let Some(svc_messages) = ({
        let Some(cliprdr) = active_stage.get_svc_processor_mut::<CliprdrClient>() else {
            return Ok(Vec::new());
        };
        Some(
            cliprdr
                .drive_timeouts()
                .map_err(|error| session::custom_err!("CLIPRDR timeout cleanup", error))?,
        )
    }) else {
        return Ok(Vec::new());
    };
    let frame = active_stage.process_svc_processor_messages(svc_messages)?;
    response_frame_output(frame)
}

pub(super) fn text_clipboard_formats() -> Vec<ClipboardFormat> {
    vec![
        ClipboardFormat::new(ClipboardFormatId::CF_UNICODETEXT),
        ClipboardFormat::new(ClipboardFormatId::CF_TEXT),
    ]
}

pub(super) fn image_clipboard_formats(
    format: RemoteDesktopClipboardFormat,
) -> Vec<ClipboardFormat> {
    let (id, name) = local_image_clipboard_format(format);
    let mut formats = vec![ClipboardFormat::new(id).with_name(ClipboardFormatName::new(name))];
    if format == RemoteDesktopClipboardFormat::ImagePng {
        // Windows peers commonly request bitmap clipboard data even when a PNG
        // registered format is also available.
        formats.push(ClipboardFormat::new(ClipboardFormatId::CF_DIBV5));
        formats.push(ClipboardFormat::new(ClipboardFormatId::CF_DIB));
    }
    if format == RemoteDesktopClipboardFormat::ImageTiff {
        // TIFF is one of the standard Win32 clipboard formats. Advertise it
        // alongside the registered MIME name so older peers can request it.
        formats.push(ClipboardFormat::new(ClipboardFormatId::CF_TIFF));
    }
    formats
}

pub(super) fn preferred_text_clipboard_format(
    formats: &[ClipboardFormat],
) -> Option<ClipboardFormatId> {
    formats
        .iter()
        .find(|format| format.id == ClipboardFormatId::CF_UNICODETEXT)
        .or_else(|| {
            formats
                .iter()
                .find(|format| format.id == ClipboardFormatId::CF_TEXT)
        })
        .map(|format| format.id)
}

pub(super) fn preferred_image_clipboard_format(
    formats: &[ClipboardFormat],
) -> Option<RdpClipboardDataFormat> {
    formats
        .iter()
        .find_map(rdp_clipboard_data_format_from_named_format)
        .or_else(|| {
            formats
                .iter()
                .find(|format| format.id == ClipboardFormatId::CF_DIBV5)
                .map(|format| RdpClipboardDataFormat {
                    id: format.id,
                    format: RemoteDesktopClipboardFormat::ImagePng,
                    encoding: RdpClipboardDataEncoding::DibV5,
                })
        })
        .or_else(|| {
            formats
                .iter()
                .find(|format| format.id == ClipboardFormatId::CF_DIB)
                .map(|format| RdpClipboardDataFormat {
                    id: format.id,
                    format: RemoteDesktopClipboardFormat::ImagePng,
                    encoding: RdpClipboardDataEncoding::Dib,
                })
        })
        .or_else(|| {
            formats
                .iter()
                .find(|format| format.id == ClipboardFormatId::CF_TIFF)
                .map(|format| RdpClipboardDataFormat {
                    id: format.id,
                    format: RemoteDesktopClipboardFormat::ImageTiff,
                    encoding: RdpClipboardDataEncoding::Encoded,
                })
        })
}

pub(super) fn decode_remote_clipboard_data(
    format: RdpClipboardDataFormat,
    bytes: Vec<u8>,
) -> Option<RemoteDesktopClipboardData> {
    if bytes.is_empty() {
        return None;
    }
    let bytes = match format.encoding {
        RdpClipboardDataEncoding::Encoded => bytes,
        RdpClipboardDataEncoding::Dib => dib_to_png(&bytes).ok()?,
        RdpClipboardDataEncoding::DibV5 => dibv5_to_png(&bytes).ok()?,
    };
    Some(RemoteDesktopClipboardData::new(format.format, bytes))
}

pub(super) fn local_image_clipboard_format(
    format: RemoteDesktopClipboardFormat,
) -> (ClipboardFormatId, &'static str) {
    match format {
        RemoteDesktopClipboardFormat::ImagePng => (RDP_CLIPBOARD_FORMAT_IMAGE_PNG, "PNG"),
        RemoteDesktopClipboardFormat::ImageJpeg => (RDP_CLIPBOARD_FORMAT_IMAGE_JPEG, "JFIF"),
        RemoteDesktopClipboardFormat::ImageWebp => (RDP_CLIPBOARD_FORMAT_IMAGE_WEBP, "image/webp"),
        RemoteDesktopClipboardFormat::ImageGif => (RDP_CLIPBOARD_FORMAT_IMAGE_GIF, "GIF"),
        RemoteDesktopClipboardFormat::ImageSvg => (RDP_CLIPBOARD_FORMAT_IMAGE_SVG, "image/svg+xml"),
        RemoteDesktopClipboardFormat::ImageBmp => (RDP_CLIPBOARD_FORMAT_IMAGE_BMP, "image/bmp"),
        RemoteDesktopClipboardFormat::ImageTiff => (RDP_CLIPBOARD_FORMAT_IMAGE_TIFF, "image/tiff"),
    }
}

pub(super) fn local_image_clipboard_format_ids(
    format: RemoteDesktopClipboardFormat,
) -> Vec<ClipboardFormatId> {
    let (id, _) = local_image_clipboard_format(format);
    let mut ids = vec![id];
    if format == RemoteDesktopClipboardFormat::ImagePng {
        ids.push(ClipboardFormatId::CF_DIBV5);
        ids.push(ClipboardFormatId::CF_DIB);
    }
    if format == RemoteDesktopClipboardFormat::ImageTiff {
        ids.push(ClipboardFormatId::CF_TIFF);
    }
    ids
}

pub(super) fn encode_local_clipboard_data(
    data: &RemoteDesktopClipboardData,
    format: ClipboardFormatId,
) -> Option<Vec<u8>> {
    if !local_image_clipboard_format_ids(data.format).contains(&format) {
        return None;
    }
    match (data.format, format) {
        (RemoteDesktopClipboardFormat::ImagePng, ClipboardFormatId::CF_DIB) => {
            png_to_cf_dib(&data.bytes).ok()
        }
        (RemoteDesktopClipboardFormat::ImagePng, ClipboardFormatId::CF_DIBV5) => {
            png_to_cf_dibv5(&data.bytes).ok()
        }
        _ => Some(data.bytes.clone()),
    }
}

pub(super) fn rdp_clipboard_data_format_from_named_format(
    format: &ClipboardFormat,
) -> Option<RdpClipboardDataFormat> {
    let name = format.name()?.value();
    let clipboard_format = remote_desktop_clipboard_format_from_rdp_name(name)?;
    Some(RdpClipboardDataFormat {
        id: format.id,
        format: clipboard_format,
        encoding: RdpClipboardDataEncoding::Encoded,
    })
}

pub(super) fn remote_desktop_clipboard_format_from_rdp_name(
    name: &str,
) -> Option<RemoteDesktopClipboardFormat> {
    if name.eq_ignore_ascii_case("PNG") || name.eq_ignore_ascii_case("image/png") {
        return Some(RemoteDesktopClipboardFormat::ImagePng);
    }
    if name.eq_ignore_ascii_case("JFIF")
        || name.eq_ignore_ascii_case("JPEG")
        || name.eq_ignore_ascii_case("JPG")
        || name.eq_ignore_ascii_case("image/jpeg")
        || name.eq_ignore_ascii_case("image/jpg")
    {
        return Some(RemoteDesktopClipboardFormat::ImageJpeg);
    }
    if name.eq_ignore_ascii_case("image/webp") {
        return Some(RemoteDesktopClipboardFormat::ImageWebp);
    }
    if name.eq_ignore_ascii_case("GIF") || name.eq_ignore_ascii_case("image/gif") {
        return Some(RemoteDesktopClipboardFormat::ImageGif);
    }
    if name.eq_ignore_ascii_case("image/svg+xml") {
        return Some(RemoteDesktopClipboardFormat::ImageSvg);
    }
    if name.eq_ignore_ascii_case("image/bmp") {
        return Some(RemoteDesktopClipboardFormat::ImageBmp);
    }
    if name.eq_ignore_ascii_case("image/tiff") || name.eq_ignore_ascii_case("image/tif") {
        return Some(RemoteDesktopClipboardFormat::ImageTiff);
    }
    None
}

pub(super) fn clamp_u32_to_u16(value: u32) -> u16 {
    u16::try_from(value).unwrap_or(u16::MAX)
}
