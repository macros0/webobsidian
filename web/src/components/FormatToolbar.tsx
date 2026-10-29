import ToolbarSurface from './toolbar/ToolbarSurface';
import { useEffect, useState } from 'react';
import type { EditorView } from '@codemirror/view';

export function FormattingButtons({size,view,compact=false,disabled=false}:{size:number;view?:EditorView;compact?:boolean;disabled?:boolean}) {
  return <ToolbarSurface view={view} layout={compact?'following':'top'} disabled={disabled}/>;
}
/**
 * Markdown formatting toolbar (Obsidian Mobile-style). Two layouts:
 * - mobile: fixed above the on-screen keyboard (anchored via the visual viewport,
 *   since iOS Safari doesn't reflow fixed elements for the keyboard).
 * - desktop: an in-flow strip rendered right under the view header.
 */
export default function FormatToolbar({ mobile = false, disabled = false }: { mobile?: boolean; disabled?: boolean }) {
  const [bottom, setBottom] = useState(0);

  useEffect(() => {
    if (!mobile) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      // Gap between the layout-viewport bottom and the visual-viewport bottom =
      // height of the on-screen keyboard (0 when hidden).
      const gap = window.innerHeight - (vv.height + vv.offsetTop);
      setBottom(Math.max(0, gap));
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [mobile]);

  if (mobile) {
    return (
      <div className="mobile-toolbar" role="toolbar" aria-label="Formatting" style={{ bottom }}>
        <ToolbarSurface layout="mobile" disabled={disabled} />
      </div>
    );
  }
  return (
    <div className="format-toolbar" role="toolbar" aria-label="Formatting">
      <ToolbarSurface disabled={disabled} /><div className="fixed-format-toolbar"><ToolbarSurface layout="fixed" disabled={disabled}/></div>
    </div>
  );
}
