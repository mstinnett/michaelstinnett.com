// Scripted strokes on the lab's 14 x 12 page. a, b are dots [i, j]; tap is a point in dot coordinates.
const sq = (x0, y0, x1, y1) => [{add:[[x0,y0],[x1,y0]]}, {add:[[x1,y0],[x1,y1]]}, {add:[[x1,y1],[x0,y1]]}, {add:[[x0,y1],[x0,y0]]}];
export const CASES = [
  {name:'square', ops: sq(2,2,6,6)},
  {name:'triangle', ops:[{add:[[2,8],[6,8]]}, {add:[[6,8],[4,5]]}, {add:[[4,5],[2,8]]}]},
  {name:'nested', ops:[...sq(1,1,9,9), ...sq(3,3,6,6), ...sq(4,4,5,5)]},
  {name:'page-edge', ops:[...sq(0,0,4,4), {add:[[13,0],[9,0]]}, {add:[[9,0],[9,4]]}, {add:[[9,4],[13,4]]}, {add:[[0,11],[13,11]]}]},
  {name:'open-to-edge', ops:[{add:[[0,2],[5,2]]}, {add:[[5,2],[5,6]]}, {add:[[5,6],[0,6]]}]},
  {name:'tiny-and-slivers', ops:[{add:[[0,5],[13,6]]}, {add:[[0,6],[13,5]]}, {add:[[0,5],[0,6]]}, {add:[[13,5],[13,6]]},
    {add:[[6,0],[7,11]]}, {add:[[7,0],[6,11]]}, {add:[[6,0],[7,0]]}, {add:[[6,11],[7,11]]}, {add:[[0,0],[13,1]]}, {add:[[0,0],[13,0]]}, {add:[[13,0],[13,1]]}]},
  {name:'star-through-one-dot', ops:[...sq(2,2,10,10), {add:[[2,2],[10,10]]}, {add:[[2,10],[10,2]]}, {add:[[6,2],[6,10]]}, {add:[[2,6],[10,6]]}, {add:[[3,2],[9,10]]}, {add:[[2,9],[10,3]]}]},
  {name:'seed-under-new-line', ops:[...sq(2,2,6,6), {add:[[2,4],[6,4]]}, {add:[[4,2],[4,6]]}, ...sq(8,1,9,2), {add:[[8,1],[9,2]]}, {add:[[8,2],[9,1]]}]},
  {name:'diagonals-through-dots', ops:[{add:[[1,1],[7,7]]}, {add:[[1,7],[7,1]]}, ...sq(1,1,7,7), {add:[[1,1],[13,7]]}, {add:[[8,2],[12,10]]}, {add:[[12,10],[8,10]]}, {add:[[8,10],[8,2]]}]},
  {name:'erase-and-redraw', ops:[...sq(2,2,6,6), {add:[[2,2],[6,6]]}, {erase:[[6,2],[6,6]]}, {add:[[6,6],[6,2]]}, {erase:[[2,2],[6,6]]}, {erase:[[2,6],[6,6]]}]},
  {name:'car-sheet-taps', paper:'car', ops:[{tap:[3.5,7]}, {tap:[2,6]}, {tap:[6.5,4.5]}, {add:[[2,5],[2,7]]}, {tap:[9.5,6.6]}, {add:[[0,9],[0,11]]}, {erase:[[2,5],[2,7]]}]},
  {name:'castle-sheet', paper:'castle', ops:[{tap:[6,8]}, {add:[[2,7],[11,7]]}, {add:[[6,5],[6,10]]}, {tap:[1,6]}]},
];
