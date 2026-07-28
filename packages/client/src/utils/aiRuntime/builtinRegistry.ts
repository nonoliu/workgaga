import { builtinAITools } from './builtinTools';
import { createAIToolRegistry } from './tools';

export const createBuiltinAIToolRegistry = () => createAIToolRegistry(builtinAITools);
