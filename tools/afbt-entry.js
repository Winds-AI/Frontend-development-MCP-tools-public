#!/usr/bin/env node
/*
  Simple launcher for the enhanced AFBT setup UI
*/

process.env.AFBT_ROLE = "ui";
require("./afbt-setup-enhanced.js");