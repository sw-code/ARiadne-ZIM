import { logger } from "react-native-logs";

export const log = logger.createLogger({
  levels: {
    custom: 0,
    debug: 1,
    info: 2,
    warn: 3,
    error: 4,
    devNotice: 5,
  },
});
