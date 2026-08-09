import { SegmentedControl } from '@/components/segmented-control';
import { Series, SeriesKeys, type SeriesKey } from '@/backend/drivers';

const segments = SeriesKeys.map((key) => ({ key, label: Series[key].label }));

export function SeriesPicker({
  value,
  onChange,
}: {
  value: SeriesKey;
  onChange: (key: SeriesKey) => void;
}) {
  return (
    <SegmentedControl
      segments={segments}
      value={value}
      onChange={(key) => onChange(key as SeriesKey)}
    />
  );
}
