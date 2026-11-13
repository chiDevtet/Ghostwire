const client = require("@/modules/database/internal/client");
const driver = require("mongodb");
const page = require("@/app/page");

export const probe = [client, driver, page];
