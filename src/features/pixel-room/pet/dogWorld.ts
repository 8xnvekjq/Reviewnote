import { isCellFree, ROOM_HEIGHT, ROOM_WIDTH } from '../model';
import type { RoomState } from '../model';
import { yardWalkable, YARD_HEIGHT, YARD_WIDTH } from '../yard/yardModel';
import type { DogWorld, PetCell } from './dogModel';
export function roomDogWorld(room: RoomState, player: PetCell): DogWorld {
  return { width: ROOM_WIDTH, height: ROOM_HEIGHT, outdoors: false, free: cell => isCellFree(room, cell)
    && !(cell.x >= 3 && cell.x <= 5 && cell.y >= 6)
    && !(cell.x === player.x && cell.y === player.y) };
}
export function yardDogWorld(player: PetCell): DogWorld {
  return { width: YARD_WIDTH, height: YARD_HEIGHT, outdoors: true, free: cell => yardWalkable(cell)
    && cell.x >= 9 && cell.y >= 4 && cell.y <= 9
    && !(cell.x === player.x && cell.y === player.y) };
}
