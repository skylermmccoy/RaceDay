import { SegmentedControl } from '@/components/segmented-control';
import { Series, SeriesKeys, type SeriesKey } from '@/backend/drivers';

const segments = SeriesKeys.map((key) => ({ key, label: Series[key].label }));

export function SeriesPicker({
  value,
  onChange,
  /** Series to mark as done — used by fantasy to show which entries are in. */
  done,
}: {
  value: SeriesKey;
  onChange: (key: SeriesKey) => void;
  done?: readonly SeriesKey[];
}) {
  const marked = done?.length
    ? segments.map((segment) =>
        done.includes(segment.key) ? { ...segment, label: `${segment.label} ✓` } : segment
      )
    : segments;

  return (
    <SegmentedControl
      segments={marked}
      value={value}
      onChange={(key) => onChange(key as SeriesKey)}
    />
  );
}
