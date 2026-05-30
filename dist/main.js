"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const mongoose_1 = __importDefault(require("mongoose"));
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    mongoose_1.default.connection.on('connected', () => {
        console.log('Successfully connected to MongoDB!');
    });
    await app.listen(3000);
}
bootstrap();
//# sourceMappingURL=main.js.map