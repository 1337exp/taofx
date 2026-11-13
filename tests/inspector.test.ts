import { describe, expect, it } from 'vitest';
import { inspectorTarget } from '@/editor/inspectorTarget';
import type { Resource } from '@/project/project';

const image: Resource = { id: 'img', kind: 'image', type: 'asset', path: 'textures/a.png', refs: [] };
const doc: Resource = { id: 'doc', kind: 'effect', type: 'doc', path: 'effects/a.fx.json', refs: [] };

describe('что показывает инспектор', () => {
    it('одна выбранная нода, пока на экране граф, главнее всего', () => {
        expect(inspectorTarget({ view: 'graph', selection: new Set(['n1']), resource: image })).toEqual({ kind: 'node', id: 'n1' });
    });

    it('нода, выбранная при открытом превью, не показывается: графа нет на экране', () => {
        expect(inspectorTarget({ view: 'preview', selection: new Set(['n1']), resource: undefined })).toEqual({ kind: 'document' });
        expect(inspectorTarget({ view: 'preview', selection: new Set(['n1']), resource: image })).toEqual({ kind: 'asset', resource: image });
    });

    it('несколько нод или ни одной: картинка из дерева, а без неё документ', () => {
        expect(inspectorTarget({ view: 'graph', selection: new Set(['a', 'b']), resource: image })).toEqual({ kind: 'asset', resource: image });
        expect(inspectorTarget({ view: 'graph', selection: new Set(['a', 'b']), resource: undefined })).toEqual({ kind: 'document' });
        expect(inspectorTarget({ view: 'graph', selection: new Set(), resource: undefined })).toEqual({ kind: 'document' });
    });

    it('выбранный документ это документ, выбранная картинка это картинка', () => {
        expect(inspectorTarget({ view: 'preview', selection: new Set(), resource: doc })).toEqual({ kind: 'document' });
        expect(inspectorTarget({ view: 'preview', selection: new Set(), resource: image })).toEqual({ kind: 'asset', resource: image });
    });
});
