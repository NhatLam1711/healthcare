package com.healthai.anomaly.service;

import com.healthai.anomaly.config.DatasetSourceProperties;
import com.healthai.anomaly.npy.NpyArray;
import com.healthai.anomaly.npy.NpyReader;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RemoteDatasetService {

    private final DatasetSourceProperties properties;
    private final GoogleDriveDownloader downloader;

    // Cache theo "tênDataset:loại" (data/label) để tránh tải lại Google Drive mỗi request.
    // Dùng ?refresh=true trên API để bỏ qua cache và tải lại.
    private final Map<String, NpyArray> cache = new ConcurrentHashMap<>();

    public RemoteDatasetService(DatasetSourceProperties properties, GoogleDriveDownloader downloader) {
        this.properties = properties;
        this.downloader = downloader;
    }

    public NpyArray getData(String datasetName, boolean forceRefresh) {
        return getArray(datasetName, "data", forceRefresh);
    }

    /** Trả về null nếu dataset không có label (chưa cấu hình labelUrl). */
    public NpyArray getLabel(String datasetName, boolean forceRefresh) {
        return getArray(datasetName, "label", forceRefresh);
    }

    private NpyArray getArray(String datasetName, String type, boolean forceRefresh) {
        String cacheKey = datasetName + ":" + type;
        if (!forceRefresh) {
            NpyArray cached = cache.get(cacheKey);
            if (cached != null) return cached;
        }

        DatasetSourceProperties.DatasetSource source = properties.getSources().get(datasetName);
        if (source == null) {
            throw new IllegalArgumentException("Không tìm thấy cấu hình dataset '" + datasetName
                    + "' trong application.yml (app.dataset.sources)");
        }

        String url = "data".equals(type) ? source.getDataUrl() : source.getLabelUrl();
        if (url == null) {
            return null;
        }

        byte[] bytes = downloader.download(url);
        NpyArray array = NpyReader.read(bytes);
        cache.put(cacheKey, array);
        return array;
    }
}
