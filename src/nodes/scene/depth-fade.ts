import { SCENE_DEPTH_GLSL, SCENE_SIZE_GLSL } from '../../glsl/scene';
import { defineNode } from '../../graph/registry';

/**
 * Мягкие частицы: 0 там, где пиксель частицы лежит на поверхности сцены, и растёт до 1 на расстоянии `distance` перед ней.
 * Умножьте на него непрозрачность: частицы перестанут резать геометрию жёстким краем. Расстояние в единицах сцены вдоль взгляда.
 * Нужна глубина сцены (`depth`): у WebGPURenderer она есть сама, у классического WebGLRenderer её отдаёт игра.
 */
export default defineNode({
    id: 'scene/depth-fade',
    title: 'Depth fade',
    inputs: { distance: { type: 'float', default: 0.5 } },
    outputs: { fade: { type: 'float' } },
    needs: ['depth'],
    glsl: ({ distance }, ctx) => {
        ctx.helper('sceneSize', SCENE_SIZE_GLSL);
        ctx.helper('sceneDepth', SCENE_DEPTH_GLSL);
        return { fade: `clamp((fxSceneViewDepth() - vViewDepth) / max(${distance}, 0.0001), 0.0, 1.0)` };
    },
});
