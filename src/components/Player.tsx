import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import { useInput } from '../hooks/useInput';
import { useGameStore } from '../store/gameStore';

// Physics
const WALK_SPEED = 4;
const RUN_SPEED = 8;
const SIT_SPEED = 3;
const CRAWL_SPEED = 1;
const JUMP_POWER = 10;
const GRAVITY = -25;
const DASH_SPEED = 12;
const DASH_DURATION = 1;
const DASH_COOLDOWN = 1.0;

// 재사용 가능한 객체 (매 프레임 생성 방지)
const _vel = new THREE.Vector3();
const _move = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _targetQuat = new THREE.Quaternion();

type AnimMap = Record<string, string>;

export function Player() {
  const group = useRef<THREE.Group>(null!);
  const { scene, animations } = useGLTF('/Untitled1.glb');
  const { actions, names } = useAnimations(animations, scene);

  const [animMap, setAnimMap] = useState<AnimMap>({});

  // State refs
  const velocityY = useRef(0);
  const grounded = useRef(true);
  const dashing = useRef(false);
  const dashTimer = useRef(0);
  const dashCooldown = useRef(0);
  const dashDir = useRef(new THREE.Vector3());
  const currentAnim = useRef('');
  const prev = useRef({ space: false, c: false, z: false, v: false });
  const lastPos = useRef({ x: 0, y: 0, z: 0 });
  const headMeshes = useRef<THREE.Object3D[]>([]);

  const input = useInput();

  // 머리 메쉬 찾기
  useEffect(() => {
    const meshes: THREE.Object3D[] = [];
    scene.traverse((child) => {
      // HeadSkin, Face, Helmet 머티리얼을 가진 메쉬 찾기
      if ((child as any).isMesh || (child as any).isSkinnedMesh) {
        const material = (child as any).material;
        if (material && material.name) {
          if (material.name.includes('HeadSkin') ||
              material.name.includes('Face') ||
              material.name.includes('Helmet')) {
            meshes.push(child);
          }
        }
      }
    });
    headMeshes.current = meshes;
  }, [scene]);

  // Build animation map on mount
  useEffect(() => {
    const map: AnimMap = {};
    const targets = ['Idle', 'Walk', 'Run', 'Jump', 'SitPose', 'SitWalk', 'CrawlPose', 'Crawl', 'Roll'];

    targets.forEach(target => {
      let found = names.find(n => {
        const parts = n.split('|');
        const clipName = parts[parts.length - 1];
        return clipName.toLowerCase() === target.toLowerCase();
      });

      if (!found) {
        found = names.find(n => n.toLowerCase().includes(target.toLowerCase()));
      }

      if (found) {
        map[target] = found;
      }
    });

    setAnimMap(map);
  }, [names]);

  // Play initial animation
  const initialized = useRef(false);
  useEffect(() => {
    if (Object.keys(animMap).length > 0 && !initialized.current) {
      initialized.current = true;
      playAnim('Idle');
    }
  }, [animMap]);

  const playAnim = (name: string) => {
    if (currentAnim.current === name) return;
    if (Object.keys(animMap).length === 0) return;

    const clipName = animMap[name];
    if (!clipName) return;

    const action = actions[clipName];
    if (!action) return;

    const prevClip = animMap[currentAnim.current];
    if (prevClip && actions[prevClip]) {
      actions[prevClip]?.fadeOut(0.2);
    }

    action.reset().fadeIn(0.2).play();

    if (name === 'Jump' || name === 'Roll') {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      if (name === 'Roll') {
        action.timeScale = 2.3;
      }
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
    }

    currentAnim.current = name;
    useGameStore.getState().setAnimation(name);
  };

  const getAnim = (moving: boolean, running: boolean, posture: string): string => {
    if (posture === 'sitting') return moving ? 'SitWalk' : 'SitPose';
    if (posture === 'crawling') return moving ? 'Crawl' : 'CrawlPose';
    if (moving) return running ? 'Run' : 'Walk';
    return 'Idle';
  };

  useFrame((_, dt) => {
    if (!group.current) return;

    const keys = input.current;
    const store = useGameStore.getState();
    const posture = store.posture;
    const cameraAngle = store.cameraAngle;

    // Cooldowns
    if (dashCooldown.current > 0) dashCooldown.current -= dt;

    // Posture toggles (C: 앉기, Z: 엎드리기)
    if (keys.c && !prev.current.c && grounded.current && !dashing.current) {
      store.setPosture(posture === 'sitting' ? 'standing' : 'sitting');
    }
    if (keys.z && !prev.current.z && grounded.current && !dashing.current) {
      store.setPosture(posture === 'crawling' ? 'standing' : 'crawling');
    }

    // Jump
    if (keys.space && !prev.current.space && grounded.current && posture === 'standing' && !dashing.current) {
      velocityY.current = JUMP_POWER;
      grounded.current = false;
      playAnim('Jump');
    }

    // Dash (Roll)
    if (keys.v && !prev.current.v && grounded.current && posture === 'standing' && !dashing.current && dashCooldown.current <= 0) {
      dashing.current = true;
      dashTimer.current = DASH_DURATION;
      dashCooldown.current = DASH_COOLDOWN;

      _dir.set(0, 0, 0);
      if (keys.forward) _dir.z -= 1;
      if (keys.backward) _dir.z += 1;
      if (keys.left) _dir.x -= 1;
      if (keys.right) _dir.x += 1;

      if (_dir.lengthSq() === 0) {
        scene.getWorldDirection(_dir);
        _dir.y = 0;
      }
      _dir.normalize().applyAxisAngle(_yAxis, cameraAngle);
      dashDir.current.copy(_dir);
      playAnim('Roll');
    }

    prev.current = { space: keys.space, c: keys.c, z: keys.z, v: keys.v };

    // Movement
    _vel.set(0, 0, 0);

    if (dashing.current) {
      dashTimer.current -= dt;
      _vel.copy(dashDir.current).multiplyScalar(DASH_SPEED * dt);
      if (dashTimer.current <= 0) {
        dashing.current = false;
        const moving = keys.forward || keys.backward || keys.left || keys.right;
        const running = keys.shift && posture === 'standing';
        playAnim(getAnim(moving, running, posture));
      }
    } else {
      _move.set(0, 0, 0);
      if (keys.forward) _move.z -= 1;
      if (keys.backward) _move.z += 1;
      if (keys.left) _move.x -= 1;
      if (keys.right) _move.x += 1;

      const moving = _move.lengthSq() > 0;
      const running = keys.shift && posture === 'standing';

      if (moving) {
        _move.normalize().applyAxisAngle(_yAxis, cameraAngle);

        const angle = Math.atan2(_move.x, _move.z);
        _targetQuat.setFromAxisAngle(_yAxis, angle);
        scene.quaternion.slerp(_targetQuat, 0.15);

        let speed = WALK_SPEED;
        if (posture === 'sitting') speed = SIT_SPEED;
        else if (posture === 'crawling') speed = CRAWL_SPEED;
        else if (running) speed = RUN_SPEED;

        if (!grounded.current) speed *= 0.8;

        _vel.copy(_move).multiplyScalar(speed * dt);
      }

      if (grounded.current) {
        playAnim(getAnim(moving, running, posture));
      }
    }

    // Gravity
    velocityY.current += GRAVITY * dt;
    group.current.position.x += _vel.x;
    group.current.position.z += _vel.z;
    group.current.position.y += velocityY.current * dt;

    // Ground
    if (group.current.position.y <= 0) {
      group.current.position.y = 0;
      velocityY.current = 0;
      if (!grounded.current) {
        grounded.current = true;
        if (!dashing.current) {
          const moving = keys.forward || keys.backward || keys.left || keys.right;
          playAnim(getAnim(moving, keys.shift && posture === 'standing', posture));
        }
      }
    }

    // Update player position (only when changed)
    const pos = group.current.position;
    if (pos.x !== lastPos.current.x || pos.y !== lastPos.current.y || pos.z !== lastPos.current.z) {
      lastPos.current = { x: pos.x, y: pos.y, z: pos.z };
      store.setPlayerPos([pos.x, pos.y, pos.z]);
    }
  });

  return (
    <group ref={group}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload('/Untitled.glb');
