#!/usr/bin/env node
import { cac } from 'cac';
import { runTui } from './tui';

const cli = cac('openapi-to-services');

cli
  .command('', 'Start the interactive TUI')
  .action(async () => {
    await runTui();
  });

cli.help();
cli.version('0.0.1');

cli.parse();
