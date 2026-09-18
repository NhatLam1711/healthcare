package com.healthai.anomaly.service;

import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class GoogleDriveDownloader {

    // Hỗ trợ các dạng link phổ biến:
    //   https://drive.google.com/file/d/FILE_ID/view?usp=sharing
    //   https://drive.google.com/open?id=FILE_ID
    //   https://drive.google.com/uc?id=FILE_ID
    private static final Pattern[] FILE_ID_PATTERNS = {
            Pattern.compile("/d/([a-zA-Z0-9_-]+)"),
            Pattern.compile("[?&]id=([a-zA-Z0-9_-]+)")
    };
    private static final Pattern CONFIRM_TOKEN_PATTERN = Pattern.compile("confirm=([0-9A-Za-z_]+)");

    private final RestTemplate restTemplate;

    public GoogleDriveDownloader(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    public String extractFileId(String shareLink) {
        for (Pattern p : FILE_ID_PATTERNS) {
            Matcher m = p.matcher(shareLink);
            if (m.find()) return m.group(1);
        }
        throw new IllegalArgumentException("Không tách được fileId từ link Google Drive: " + shareLink);
    }

    /**
     * Tải file trực tiếp từ Google Drive về dạng byte[].
     * Yêu cầu file để chế độ chia sẻ "Anyone with the link".
     */
    public byte[] download(String shareLink) {
        String fileId = extractFileId(shareLink);
        String url = "https://drive.google.com/uc?export=download&id=" + fileId;

        ResponseEntity<byte[]> response = restTemplate.exchange(url, HttpMethod.GET, HttpEntity.EMPTY, byte[].class);
        byte[] body = response.getBody();

        if (isHtml(body)) {
            // File dung lượng lớn -> Google trả về trang cảnh báo virus scan kèm confirm token,
            // cần gọi lại 1 lần nữa với token đó mới lấy được file thật.
            String html = new String(body, StandardCharsets.UTF_8);
            Matcher m = CONFIRM_TOKEN_PATTERN.matcher(html);
            if (m.find()) {
                String confirmUrl = "https://drive.google.com/uc?export=download&confirm="
                        + m.group(1) + "&id=" + fileId;
                response = restTemplate.exchange(confirmUrl, HttpMethod.GET, HttpEntity.EMPTY, byte[].class);
                body = response.getBody();
                if (isHtml(body)) {
                    throw new IllegalStateException(
                            "Vẫn nhận được HTML sau khi confirm. Kiểm tra lại quyền chia sẻ file (fileId=" + fileId + ")");
                }
            } else {
                throw new IllegalStateException(
                        "Google Drive trả về HTML thay vì file .npy. Nguyên nhân thường gặp: link chưa để " +
                        "chế độ 'Anyone with the link' (Bất kỳ ai có đường liên kết đều xem được), " +
                        "hoặc fileId sai. fileId=" + fileId);
            }
        }
        return body;
    }

    private boolean isHtml(byte[] body) {
        if (body == null || body.length < 15) return false;
        String start = new String(body, 0, Math.min(200, body.length), StandardCharsets.UTF_8).trim().toLowerCase();
        return start.startsWith("<!doctype") || start.startsWith("<html");
    }
}
