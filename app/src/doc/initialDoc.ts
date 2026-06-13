import { DOC_VERSION, type ProjectDoc } from './types'

const LANE_MAIN = 80
const LANE_SUB = 320
const COL = 260

/**
 * A fresh project: a main happy-path flow running left→right, one sub-flow
 * launched by a screen, screen states, and the four diff statuses so the
 * color system is visible from the start. Positions live in the doc so the
 * canvas layout round-trips through the JSON.
 */
export function createInitialDoc(name: string): ProjectDoc {
  return {
    version: DOC_VERSION,
    name,
    flows: [
      {
        id: 'flow-main',
        name: 'Main Flow (Happy Path)',
        kind: 'main',
        screenIds: ['onboarding', 'login', 'home', 'profile'],
      },
      {
        id: 'flow-permissions',
        name: 'Permissions',
        kind: 'sub',
        parentFlowId: 'flow-main',
        startsFromScreenId: 'home',
        screenIds: ['camera-perm'],
      },
    ],
    screens: [
      {
        id: 'onboarding',
        name: 'Onboarding',
        meta: 'Auth',
        status: 'locked',
        position: { x: 0 * COL, y: LANE_MAIN },
        states: [{ id: 'onboarding-main', name: 'Main', status: 'locked' }],
      },
      {
        id: 'login',
        name: 'Login',
        meta: 'Auth',
        status: 'changed',
        position: { x: 1 * COL, y: LANE_MAIN },
        states: [
          { id: 'login-main', name: 'Main', status: 'locked' },
          { id: 'login-error', name: 'Error', status: 'changed' },
        ],
      },
      {
        id: 'home',
        name: 'Home Feed',
        meta: 'Main',
        status: 'new',
        position: { x: 2 * COL, y: LANE_MAIN },
        states: [
          { id: 'home-main', name: 'Main', status: 'new' },
          { id: 'home-loading', name: 'Loading', status: 'new' },
          { id: 'home-empty', name: 'Empty', status: 'new' },
          { id: 'home-error', name: 'Error', status: 'new' },
        ],
      },
      {
        id: 'profile',
        name: 'Profile',
        meta: 'Main',
        status: 'locked',
        position: { x: 3 * COL, y: LANE_MAIN },
        states: [{ id: 'profile-main', name: 'Main', status: 'locked' }],
      },
      {
        id: 'camera-perm',
        name: 'Camera Permission',
        meta: 'Gap · Permissions',
        status: 'new',
        position: { x: 2 * COL, y: LANE_SUB },
        states: [
          { id: 'cam-empty', name: 'Empty', status: 'new' },
          { id: 'cam-granted', name: 'Granted', status: 'new' },
        ],
      },
      {
        id: 'settings-old',
        name: 'Old Settings',
        meta: 'Main',
        status: 'deleted',
        position: { x: 4 * COL, y: LANE_SUB },
        states: [],
      },
    ],
    edges: [
      { id: 'e-onb-login', source: 'onboarding', target: 'login' },
      { id: 'e-login-home', source: 'login', target: 'home' },
      { id: 'e-home-profile', source: 'home', target: 'profile' },
      { id: 'e-home-cam', source: 'home', target: 'camera-perm' },
    ],
  }
}
