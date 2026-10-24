import { DropdownMenu } from 'radix-ui';
import { ChevronDown, Download, FileJson, FileSpreadsheet } from 'lucide-react';
import { buttonClass } from '../../../ui/Button.tsx';

/** Download the set as a Ludora file or a spreadsheet. */
export function ExportMenu({ onExport, disabled }: { onExport: (format: 'json' | 'csv') => void; disabled?: boolean }) {
  const item = 'flex min-h-11 cursor-pointer items-start gap-2.5 rounded-[var(--radius-s)] px-3 py-2 text-sm text-text-2 outline-none data-[highlighted]:bg-surface-2 data-[highlighted]:text-text';
  return (
    // Not modal: the page stays readable to screen readers while the menu is open, and Tab or Escape leaves it.
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger className={buttonClass('secondary', 'md')} disabled={disabled}>
        <Download className="size-4" aria-hidden />
        Export
        <ChevronDown className="size-4 text-text-3" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="lift z-50 w-72 max-w-[calc(100vw-32px)] rounded-[var(--radius-m)] border border-line bg-raised p-1.5">
          <DropdownMenu.Item className={item} onSelect={() => onExport('json')}>
            <FileJson className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <span className="block font-semibold text-text">Ludora file (.json)</span>
              <span className="block text-xs text-text-3">Everything, including images. Import it into any set.</span>
            </span>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => onExport('csv')}>
            <FileSpreadsheet className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <span className="block font-semibold text-text">Spreadsheet (.csv)</span>
              <span className="block text-xs text-text-3">Edit in Excel, Numbers or Google Sheets, then import it back.</span>
            </span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
