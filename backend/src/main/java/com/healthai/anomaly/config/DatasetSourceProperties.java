package com.healthai.anomaly.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/**
 * Cấu hình mapping: tên dataset -> link Google Drive (data + label).
 *
 * Khai báo trong application.yml, ví dụ:
 *
 * app:
 *   dataset:
 *     sources:
 *       2Dgesture:
 *         data-url: "https://drive.google.com/file/d/XXXXXXXX/view?usp=sharing"
 *         label-url: "https://drive.google.com/file/d/YYYYYYYY/view?usp=sharing"
 *       MSL:
 *         label-url: "https://drive.google.com/file/d/ZZZZZZZZ/view?usp=sharing"
 *
 * LƯU Ý: file trên Google Drive phải để chế độ chia sẻ
 * "Anyone with the link" (Bất kỳ ai có đường liên kết) thì server mới
 * tải được trực tiếp mà không cần OAuth.
 */
@Component
@ConfigurationProperties(prefix = "app.dataset")
public class DatasetSourceProperties {

    private Map<String, DatasetSource> sources = new HashMap<>();

    public Map<String, DatasetSource> getSources() { return sources; }
    public void setSources(Map<String, DatasetSource> sources) { this.sources = sources; }

    public static class DatasetSource {
        private String dataUrl;
        private String labelUrl; // có thể null nếu dataset chưa có label

        public String getDataUrl() { return dataUrl; }
        public void setDataUrl(String dataUrl) { this.dataUrl = dataUrl; }

        public String getLabelUrl() { return labelUrl; }
        public void setLabelUrl(String labelUrl) { this.labelUrl = labelUrl; }
    }
}
