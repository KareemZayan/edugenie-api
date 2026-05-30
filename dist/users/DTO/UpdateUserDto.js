"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateUserDto = void 0;
const mapped_types_1 = require("@nestjs/mapped-types");
const CreateUserDto_1 = require("./CreateUserDto");
class UpdateUserDto extends (0, mapped_types_1.PartialType)(CreateUserDto_1.CreateUserDto) {
}
exports.UpdateUserDto = UpdateUserDto;
//# sourceMappingURL=UpdateUserDto.js.map