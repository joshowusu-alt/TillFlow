import { listPageWindow } from '@/lib/pagination';

type ShowingRangeProps = {
  page: number;
  pageSize: number;
  total: number;
  noun: string;
};

export default function ShowingRange({ page, pageSize, total, noun }: ShowingRangeProps) {
  if (total <= 0) {
    return <p className="text-xs text-black/50">Showing 0 of 0 {noun}.</p>;
  }
  const window = listPageWindow(page, total, pageSize);
  const start = window.skip + 1;
  const end = Math.min(window.skip + window.take, total);
  return (
    <p className="text-xs text-black/50">
      Showing {start}–{end} of {total} {noun}.
    </p>
  );
}
