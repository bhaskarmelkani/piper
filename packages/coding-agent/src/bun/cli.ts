#!/usr/bin/env bun
import { APP_NAME } from "../config.js";

process.title = APP_NAME;
process.emitWarning = (() => {}) as typeof process.emitWarning;

import "./register-bedrock.js";
import "../cli.js";
