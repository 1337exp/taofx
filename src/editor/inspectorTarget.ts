import type { Resource } from '@/project/project';
import type { CenterView } from './layout';

/** Что показывает инспектор: выбранную ноду графа, выбранную в дереве картинку или сам документ. */
export type InspectorTarget = { kind: 'node'; id: string } | { kind: 'asset'; resource: Resource } | { kind: 'document' };

/**
 * Выбор показываемого: одна выбранная нода (пока граф на экране) главнее выбранной в дереве картинки, а она главнее документа.
 * Несколько выбранных нод и выбранная связь это пока документ: у них нет общего набора свойств.
 */
export function inspectorTarget(input: { view: CenterView; selection: ReadonlySet<string>; resource: Resource | undefined }): InspectorTarget {
    if (input.view === 'graph' && input.selection.size === 1) return { kind: 'node', id: [...input.selection][0]! };
    if (input.resource?.type === 'asset') return { kind: 'asset', resource: input.resource };
    return { kind: 'document' };
}
