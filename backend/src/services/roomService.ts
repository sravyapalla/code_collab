import { RoomState } from "../types.js";
import { RoomRepository } from "../repositories/roomRepository.js";

export class RoomService {
  constructor(private readonly repository: RoomRepository) {}

  async getOrCreateRoom(roomId: string): Promise<RoomState> {
    return this.repository.getOrCreateRoom(roomId);
  }

  async updateCode(roomId: string, code: string): Promise<RoomState> {
    const room = await this.repository.updateRoomCode(roomId, code);
    await this.repository.saveRoomSnapshot(room);
    return room;
  }

  async updateLanguage(roomId: string, language: string): Promise<RoomState> {
    const room = await this.repository.updateRoomLanguage(roomId, language);
    await this.repository.saveRoomSnapshot(room);
    return room;
  }
}

