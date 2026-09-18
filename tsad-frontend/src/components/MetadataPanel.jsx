export default function MetadataPanel({ info, error }) {
  return (
    <>
      {error ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-100">{error}</div>
      ) : !info ? (
        <p className="text-gray-400 animate-pulse">Loading metadata...</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { label: 'Datapath', value: info.datapath },
            { label: 'Shape', value: `[${info.shape.join(', ')}]` },
            { label: 'DType', value: info.dtype },
            { label: 'Length', value: info.length },
            { label: 'Dimension', value: info.dimension },
            {
              label: 'Anomaly %',
              value:
                info.anomalyPercent !== null ? (
                  <span className="text-red-600 font-bold">{parseFloat(info.anomalyPercent).toFixed(2)}%</span>
                ) : (
                  <span className="text-gray-400 font-normal">N/A</span>
                ),
            },
          ].map((item) => (
            <div key={item.label} className="bg-gray-50 p-4 rounded-lg border border-gray-100">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{item.label}</p>
              <p className="text-lg font-semibold text-gray-800 truncate" title={String(item.value)}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
