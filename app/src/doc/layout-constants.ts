// Background dot grid pitch + dot size. All lane geometry is keyed to these so
// the lane guide dots land exactly on the grid's dots (see LaneGuides). Kept in
// their own module so `devices.ts` (layout metrics) and `layout.ts` can both
// import them without a circular dependency.
export const GRID_GAP = 20
export const GRID_DOT_SIZE = 1
