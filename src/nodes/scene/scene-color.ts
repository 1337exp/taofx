import { SCENE_COLOR_GLSL, SCENE_SIZE_GLSL } from '../../glsl/scene';
import { defineNode } from '../../graph/registry';

/**
 * Цвет уже нарисованной сцены за этим пикселем со сдвигом `offset` (в долях экрана): основа рефракции, марева над огнём,
 * стекла и искажений. Подайте в сдвиг шум или текстуру. Нужен цвет сцены (`sceneColor`): у WebGPURenderer он есть сам,
 * у классического WebGLRenderer его отдаёт игра.
 */
export default defineNode({
    id: 'scene/scene-color',
    title: 'Scene color',
    inputs: { offset: { type: 'vec2', default: [0, 0] } },
    outputs: { color: { type: 'color' } },
    needs: ['sceneColor'],
    glsl: ({ offset }, ctx) => {
        ctx.helper('sceneSize', SCENE_SIZE_GLSL);
        ctx.helper('sceneColor', SCENE_COLOR_GLSL);
        return { color: `fxSceneColor(${offset})` };
    },
});
