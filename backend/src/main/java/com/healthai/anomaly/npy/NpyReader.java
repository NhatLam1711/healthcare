package com.healthai.anomaly.npy;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Đọc file .npy thuần Java, không phụ thuộc thư viện ngoài.
 *
 * Cấu trúc file .npy:
 *   [6 bytes magic "\x93NUMPY"] [1 byte major version] [1 byte minor version]
 *   [2 hoặc 4 bytes header length (little-endian, tùy version)]
 *   [header - chuỗi dict Python dạng ASCII, vd:
 *        "{'descr': '<f8', 'fortran_order': False, 'shape': (8451, 2), }"]
 *   [dữ liệu nhị phân, đúng dtype/shape mô tả ở trên]
 *
 * Hỗ trợ dtype phổ biến: <f8 (float64), <f4 (float32), <i8, <i4, <i2, |u1, |b1 (bool).
 * Hỗ trợ shape N chiều bất kỳ — chiều đầu tiên coi là "số điểm" (rows),
 * các chiều còn lại được duỗi phẳng thành 1 mảng double cho mỗi điểm.
 */
public class NpyReader {

    private static final byte[] MAGIC = {(byte) 0x93, 'N', 'U', 'M', 'P', 'Y'};
    private static final Pattern DESCR_PATTERN = Pattern.compile("'descr'\\s*:\\s*'([^']+)'");
    private static final Pattern SHAPE_PATTERN = Pattern.compile("'shape'\\s*:\\s*\\(([^)]*)\\)");
    private static final Pattern FORTRAN_PATTERN = Pattern.compile("'fortran_order'\\s*:\\s*(True|False)");

    public static NpyArray read(byte[] bytes) {
        ByteBuffer buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);

        // 1. Kiểm tra magic
        for (int i = 0; i < MAGIC.length; i++) {
            if (bytes[i] != MAGIC[i]) {
                throw new IllegalArgumentException("File không đúng định dạng .npy (magic header sai)");
            }
        }

        int majorVersion = bytes[6] & 0xFF;
        int headerLenBytes;
        int headerStart;

        if (majorVersion == 1) {
            buf.position(8);
            headerLenBytes = buf.getShort() & 0xFFFF; // unsigned 16-bit
            headerStart = 10;
        } else {
            buf.position(8);
            headerLenBytes = buf.getInt();
            headerStart = 12;
        }

        String header = new String(bytes, headerStart, headerLenBytes, java.nio.charset.StandardCharsets.US_ASCII);

        Matcher descrMatcher = DESCR_PATTERN.matcher(header);
        Matcher shapeMatcher = SHAPE_PATTERN.matcher(header);
        Matcher fortranMatcher = FORTRAN_PATTERN.matcher(header);

        if (!descrMatcher.find() || !shapeMatcher.find()) {
            throw new IllegalArgumentException("Không đọc được header .npy: " + header);
        }

        String dtype = descrMatcher.group(1);
        boolean fortranOrder = fortranMatcher.find() && fortranMatcher.group(1).equals("True");

        String shapeStr = shapeMatcher.group(1).trim();
        List<Integer> shapeList = new ArrayList<>();
        if (!shapeStr.isEmpty()) {
            for (String part : shapeStr.split(",")) {
                String p = part.trim();
                if (!p.isEmpty()) {
                    shapeList.add(Integer.parseInt(p));
                }
            }
        }
        int[] shape = shapeList.stream().mapToInt(Integer::intValue).toArray();

        int numRows = shape.length == 0 ? 1 : shape[0];
        int rowSize = 1;
        for (int i = 1; i < shape.length; i++) {
            rowSize *= shape[i];
        }
        if (shape.length == 0) {
            rowSize = 1;
        }

        int dataStart = headerStart + headerLenBytes;
        ByteBuffer dataBuf = ByteBuffer.wrap(bytes, dataStart, bytes.length - dataStart).order(ByteOrder.LITTLE_ENDIAN);

        int totalValues = numRows * rowSize;
        double[] flat = new double[totalValues];

        switch (dtype) {
            case "<f8" -> {
                for (int i = 0; i < totalValues; i++) flat[i] = dataBuf.getDouble();
            }
            case "<f4" -> {
                for (int i = 0; i < totalValues; i++) flat[i] = dataBuf.getFloat();
            }
            case "<i8" -> {
                for (int i = 0; i < totalValues; i++) flat[i] = dataBuf.getLong();
            }
            case "<i4" -> {
                for (int i = 0; i < totalValues; i++) flat[i] = dataBuf.getInt();
            }
            case "<i2" -> {
                for (int i = 0; i < totalValues; i++) flat[i] = dataBuf.getShort();
            }
            case "|u1", "|b1" -> {
                for (int i = 0; i < totalValues; i++) flat[i] = dataBuf.get() & 0xFF;
            }
            default -> throw new IllegalArgumentException("dtype chưa hỗ trợ: " + dtype
                    + " (hiện hỗ trợ <f8, <f4, <i8, <i4, <i2, |u1, |b1)");
        }

        // fortran_order = True nghĩa là dữ liệu lưu column-major -> cần chuyển về row-major
        // (chỉ áp dụng khi có từ 2 chiều trở lên; trường hợp 1 chiều thì không khác biệt)
        if (fortranOrder && shape.length >= 2) {
            flat = fortranToRowMajor(flat, shape);
        }

        double[][] rows = new double[numRows][rowSize];
        for (int r = 0; r < numRows; r++) {
            System.arraycopy(flat, r * rowSize, rows[r], 0, rowSize);
        }

        return new NpyArray(shape, dtype, rows);
    }

    private static double[] fortranToRowMajor(double[] flat, int[] shape) {
        // Chuyển đổi tổng quát cho mảng N chiều từ column-major (Fortran) sang row-major (C)
        int ndim = shape.length;
        int total = flat.length;
        double[] result = new double[total];
        int[] strides = new int[ndim]; // fortran strides
        strides[0] = 1;
        for (int i = 1; i < ndim; i++) {
            strides[i] = strides[i - 1] * shape[i - 1];
        }
        int[] idx = new int[ndim];
        for (int linearC = 0; linearC < total; linearC++) {
            int remaining = linearC;
            for (int d = 0; d < ndim; d++) {
                int dimSizeProduct = 1;
                for (int k = d + 1; k < ndim; k++) dimSizeProduct *= shape[k];
                idx[d] = remaining / dimSizeProduct;
                remaining = remaining % dimSizeProduct;
            }
            int fortranLinear = 0;
            for (int d = 0; d < ndim; d++) {
                fortranLinear += idx[d] * strides[d];
            }
            result[linearC] = flat[fortranLinear];
        }
        return result;
    }
}
