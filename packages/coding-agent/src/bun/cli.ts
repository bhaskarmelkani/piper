#!/usr/bin/env bun
process.title = "piper";
process.emitWarning = (() => {}) as typeof process.emitWarning;

import "./register-bedrock.js";
import "../cli.js";
