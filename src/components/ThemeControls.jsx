import { ThemeMenu } from '@smartmemory/design-system/shell';
import { GRAPH_SCOPE_CLASS } from '../lib/theme';

/** Light / Dark / System in the graph toolbar. Scoped like the rest of the graph chrome (see lib/theme.js). */
export function ToolbarThemeMenu() {
  return (
    <span className={`${GRAPH_SCOPE_CLASS} contents`}>
      <ThemeMenu compact />
    </span>
  );
}

/** Light / Dark / System in the top-right corner of a full-page screen (loading, sign-in). */
export function PageThemeMenu() {
  return (
    <div className="fixed right-3 top-3 z-50">
      <ThemeMenu compact />
    </div>
  );
}
