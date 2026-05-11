import { Search } from 'lucide-react';

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
  resultCount: number;
};

export function SearchBar({ query, onQueryChange, resultCount }: Props) {
  return (
    <div className="flex w-full flex-col gap-3 md:w-auto md:min-w-[520px] md:flex-row md:items-center">
      <label className="flex h-12 flex-1 items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 shadow-sm transition focus-within:border-gray-400 focus-within:shadow-card">
        <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
        <input
          value={query}
          onChange={event => onQueryChange(event.target.value)}
          placeholder="Buscar por nombre, marca, SKU o categoria"
          autoComplete="off"
          className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-gray-950 outline-none placeholder:text-gray-400"
        />
      </label>
      <div className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-sm text-gray-500 shadow-sm">
        <strong>{resultCount}</strong>
        <span>productos</span>
      </div>
    </div>
  );
}
