<script lang="ts" setup>
import { TaoButton, TaoInputNumber, TaoSelect, TaoSwitch } from '@1337exp/taoui';
import { computed, ref } from 'vue';
import { useI18n } from '@/i18n';
import type { Collider, Force, SystemDef } from '@/particles/types';
import { useEditor } from '../store';
import Vec3Row from './Vec3Row.vue';

const editor = useEditor();
const { t } = useI18n();

const edit = (key: string, change: (s: SystemDef) => void) => editor.updateSystem(key, change);
const num = (v: number | null) => v ?? 0;

//--------------------------------------------------
// Силы

const forceTypes = computed(() => [
    { value: 'turbulence', label: t('particles.forceTurbulence') },
    { value: 'attractor', label: t('particles.forceAttractor') },
    { value: 'vortex', label: t('particles.forceVortex') },
    { value: 'wind', label: t('particles.forceWind') },
]);
const newForce = ref<Force['type']>('turbulence');

const FORCE_DEFAULTS: Record<Force['type'], () => Force> = {
    turbulence: () => ({ type: 'turbulence', strength: 2, scale: 1, speed: 0.5 }),
    attractor: () => ({ type: 'attractor', position: [0, 2, 0], strength: 5, radius: 0 }),
    vortex: () => ({ type: 'vortex', position: [0, 0, 0], axis: [0, 1, 0], strength: 5, radius: 0 }),
    wind: () => ({ type: 'wind', velocity: [1, 0, 0], strength: 1 }),
};

const forceTitle = (f: Force) => forceTypes.value.find((x) => x.value === f.type)!.label;

/** Правит поле силы `i`; серия правок одного поля склеивается в один шаг истории. */
const setForce = (i: number, field: string, change: (f: Force) => void) => edit(`force${i}.${field}`, (s) => change(s.particle.forces[i]!));

//--------------------------------------------------
// Препятствия

const colliderTypes = computed(() => [
    { value: 'plane', label: t('particles.colliderPlane') },
    { value: 'sphere', label: t('particles.colliderSphere') },
]);
const newCollider = ref<Collider['type']>('plane');

const COLLIDER_DEFAULTS: Record<Collider['type'], () => Collider> = {
    plane: () => ({ type: 'plane', normal: [0, 1, 0], offset: 0, bounce: 0.4, friction: 0.1, kill: false }),
    sphere: () => ({ type: 'sphere', center: [0, 1, 0], radius: 1, bounce: 0.4, friction: 0.1, kill: false }),
};

const colliderTitle = (c: Collider) => colliderTypes.value.find((x) => x.value === c.type)!.label;
const setCollider = (i: number, field: string, change: (c: Collider) => void) => edit(`collider${i}.${field}`, (s) => change(s.particle.colliders[i]!));
</script>

<template>
    <template v-if="editor.system">
        <section>
            <h4>{{ t('particles.forces') }}</h4>
            <div v-for="(f, i) in editor.system.particle.forces" :key="i" class="item">
                <div class="head">
                    <strong>{{ forceTitle(f) }}</strong>
                    <TaoButton size="small" variant="ghost" :aria-label="t('particles.remove')" @click="edit('forces', (s) => s.particle.forces.splice(i, 1))">✕</TaoButton>
                </div>

                <template v-if="f.type === 'turbulence'">
                    <div class="row"><span>{{ t('particles.strength') }}</span><TaoInputNumber size="small" :step="0.5" :model-value="f.strength" @update:model-value="(v) => setForce(i, 'strength', (x) => x.type === 'turbulence' && (x.strength = num(v)))" /></div>
                    <div class="row"><span>{{ t('particles.scale') }}</span><TaoInputNumber size="small" :min="0.01" :step="0.1" :model-value="f.scale" @update:model-value="(v) => setForce(i, 'scale', (x) => x.type === 'turbulence' && (x.scale = Math.max(0.01, num(v))))" /></div>
                    <div class="row"><span>{{ t('particles.fieldSpeed') }}</span><TaoInputNumber size="small" :step="0.1" :model-value="f.speed" @update:model-value="(v) => setForce(i, 'speed', (x) => x.type === 'turbulence' && (x.speed = num(v)))" /></div>
                </template>

                <template v-else-if="f.type === 'attractor'">
                    <Vec3Row :label="t('particles.position')" :model-value="f.position" @update:model-value="(v) => setForce(i, 'position', (x) => x.type === 'attractor' && (x.position = v))" />
                    <div class="row"><span>{{ t('particles.strength') }}</span><TaoInputNumber size="small" :step="0.5" :model-value="f.strength" @update:model-value="(v) => setForce(i, 'strength', (x) => x.type === 'attractor' && (x.strength = num(v)))" /></div>
                    <div class="row"><span>{{ t('particles.falloff') }}</span><TaoInputNumber size="small" :min="0" :step="0.5" :model-value="f.radius" @update:model-value="(v) => setForce(i, 'radius', (x) => x.type === 'attractor' && (x.radius = Math.max(0, num(v))))" /></div>
                </template>

                <template v-else-if="f.type === 'vortex'">
                    <Vec3Row :label="t('particles.position')" :model-value="f.position" @update:model-value="(v) => setForce(i, 'position', (x) => x.type === 'vortex' && (x.position = v))" />
                    <Vec3Row :label="t('particles.axis')" :model-value="f.axis" @update:model-value="(v) => setForce(i, 'axis', (x) => x.type === 'vortex' && (x.axis = v))" />
                    <div class="row"><span>{{ t('particles.strength') }}</span><TaoInputNumber size="small" :step="0.5" :model-value="f.strength" @update:model-value="(v) => setForce(i, 'strength', (x) => x.type === 'vortex' && (x.strength = num(v)))" /></div>
                    <div class="row"><span>{{ t('particles.falloff') }}</span><TaoInputNumber size="small" :min="0" :step="0.5" :model-value="f.radius" @update:model-value="(v) => setForce(i, 'radius', (x) => x.type === 'vortex' && (x.radius = Math.max(0, num(v))))" /></div>
                </template>

                <template v-else>
                    <Vec3Row :label="t('particles.windVelocity')" :model-value="f.velocity" @update:model-value="(v) => setForce(i, 'velocity', (x) => x.type === 'wind' && (x.velocity = v))" />
                    <div class="row"><span>{{ t('particles.strength') }}</span><TaoInputNumber size="small" :min="0" :step="0.1" :model-value="f.strength" @update:model-value="(v) => setForce(i, 'strength', (x) => x.type === 'wind' && (x.strength = Math.max(0, num(v))))" /></div>
                </template>
            </div>
            <div class="row add">
                <TaoSelect size="small" :clearable="false" :model-value="newForce" :options="forceTypes" @update:model-value="(v) => (newForce = v as Force['type'])" />
                <TaoButton size="small" variant="ghost" @click="edit('forces', (s) => s.particle.forces.push(FORCE_DEFAULTS[newForce]()))">＋ {{ t('particles.addForce') }}</TaoButton>
            </div>
        </section>

        <section>
            <h4>{{ t('particles.colliders') }}</h4>
            <div v-for="(c, i) in editor.system.particle.colliders" :key="i" class="item">
                <div class="head">
                    <strong>{{ colliderTitle(c) }}</strong>
                    <TaoButton size="small" variant="ghost" :aria-label="t('particles.remove')" @click="edit('colliders', (s) => s.particle.colliders.splice(i, 1))">✕</TaoButton>
                </div>
                <template v-if="c.type === 'plane'">
                    <Vec3Row :label="t('particles.normal')" :model-value="c.normal" @update:model-value="(v) => setCollider(i, 'normal', (x) => x.type === 'plane' && (x.normal = v))" />
                    <div class="row"><span>{{ t('particles.offset') }}</span><TaoInputNumber size="small" :step="0.1" :model-value="c.offset" @update:model-value="(v) => setCollider(i, 'offset', (x) => x.type === 'plane' && (x.offset = num(v)))" /></div>
                </template>
                <template v-else>
                    <Vec3Row :label="t('particles.center')" :model-value="c.center" @update:model-value="(v) => setCollider(i, 'center', (x) => x.type === 'sphere' && (x.center = v))" />
                    <div class="row"><span>{{ t('particles.radius') }}</span><TaoInputNumber size="small" :min="0" :step="0.1" :model-value="c.radius" @update:model-value="(v) => setCollider(i, 'radius', (x) => x.type === 'sphere' && (x.radius = Math.max(0, num(v))))" /></div>
                </template>
                <div class="row"><span>{{ t('particles.bounce') }}</span><TaoInputNumber size="small" :min="0" :max="1" :step="0.05" :model-value="c.bounce" @update:model-value="(v) => setCollider(i, 'bounce', (x) => (x.bounce = Math.min(1, Math.max(0, num(v)))))" /></div>
                <div class="row"><span>{{ t('particles.friction') }}</span><TaoInputNumber size="small" :min="0" :max="1" :step="0.05" :model-value="c.friction" @update:model-value="(v) => setCollider(i, 'friction', (x) => (x.friction = Math.min(1, Math.max(0, num(v)))))" /></div>
                <div class="row"><TaoSwitch size="small" :label="t('particles.kill')" :model-value="c.kill" @update:model-value="(v) => setCollider(i, 'kill', (x) => (x.kill = v))" /></div>
            </div>
            <div class="row add">
                <TaoSelect size="small" :clearable="false" :model-value="newCollider" :options="colliderTypes" @update:model-value="(v) => (newCollider = v as Collider['type'])" />
                <TaoButton size="small" variant="ghost" @click="edit('colliders', (s) => s.particle.colliders.push(COLLIDER_DEFAULTS[newCollider]()))">＋ {{ t('particles.addCollider') }}</TaoButton>
            </div>
        </section>
    </template>
</template>

<style scoped>
h4 {
    margin: 12px 0 6px;
    color: var(--tao-color-text-muted, #8b929c);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.item {
    margin: 6px 0;
    padding: 6px 8px;
    border: 1px solid var(--tao-color-border, #222733);
    border-radius: 8px;
}

.head {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 5px 0;
}

.row > span:first-child {
    flex: 1;
    min-width: 0;
}

.row :deep(.tao-input-number),
.row :deep(.tao-select) {
    width: 118px;
}
</style>
