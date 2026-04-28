import * as p from '@clack/prompts';
import color from 'picocolors';
import { ProfileManager } from './config';
import { generateFilesFromOpenapi, ProjectProfile } from './index';
import { fetchOpenapiSchema } from './utils';
import { v4 as uuidv4 } from 'uuid';
import { input, confirm, select } from '@inquirer/prompts';

export async function runTui() {
  const manager = new ProfileManager();
  
  p.intro(color.bgCyan(color.black(' OpenAPI to Services Generator ')));

  while (true) {
    const projects = manager.getProjects();
    const options = [
      { value: 'add', label: '➕ Add New Project' },
      ...(projects.length > 0 ? [{ value: 'run', label: '🚀 Run Generator' }] : []),
      ...(projects.length > 0 ? [{ value: 'manage', label: '⚙️ Manage Projects' }] : []),
      { value: 'exit', label: '🚪 Exit' }
    ];

    const action = await select({
      message: 'What would you like to do?',
      choices: options.map(opt => ({ name: opt.label, value: opt.value }))
    });

    if (action === 'exit') {
      p.outro('Goodbye!');
      process.exit(0);
    }

    if (action === 'add') {
      await addNewProject(manager);
    } else if (action === 'run') {
      await runGenerator(manager);
    } else if (action === 'manage') {
      await manageProjects(manager);
    }
  }
}

async function addNewProject(manager: ProfileManager) {
  try {
    const name = await input({ 
      message: 'Enter project name', 
      default: 'My Awesome API' 
    });
    
    const openapiUrl = await input({ 
      message: 'Enter OpenAPI JSON URL', 
      default: 'http://localhost:8000/openapi.json',
      transformer: (val) => val.trim().replace(/^["']|["']$/g, '')
    });
    
    const projectRoot = await input({ 
      message: 'Enter target frontend root directory', 
      default: process.cwd(),
      transformer: (val) => val.trim().replace(/^["']|["']$/g, '')
    });
    
    const stripPrefix = await input({ 
      message: 'API prefix to strip', 
      default: '/api/v1/' 
    });
    
    const useHooks = await confirm({ 
      message: 'Generate React hooks?', 
      default: true 
    });

    const profile: ProjectProfile = {
      id: uuidv4(),
      name: name.trim(),
      openapiUrl: openapiUrl.trim().replace(/^["']|["']$/g, ''),
      projectRoot: projectRoot.trim().replace(/^["']|["']$/g, ''),
      outputPaths: {
        services: './src/services-generated',
        types: './src/types',
        config: './src/config'
      },
      settings: {
        stripPrefix: stripPrefix.trim(),
        useHooks
      }
    };

    manager.saveProject(profile);
    p.note(color.green(`Project "${profile.name}" saved!`));
  } catch (error) {
    p.cancel('Operation cancelled.');
  }
}

async function runGenerator(manager: ProfileManager) {
  const projects = manager.getProjects();
  const selectedId = await select({
    message: 'Select a project to run',
    choices: projects.map((p) => ({ value: p.id, name: p.name }))
  });

  const profile = manager.getProjectById(selectedId as string);
  if (!profile) return;

  const s = p.spinner();
  s.start(`Fetching OpenAPI schema from ${profile.openapiUrl}...`);

  try {
    const schema = await fetchOpenapiSchema(profile.openapiUrl);
    s.message('Generating files...');
    await generateFilesFromOpenapi(schema, profile);
    s.stop(color.green(`Successfully generated services for "${profile.name}"!`));
  } catch (error) {
    s.stop(color.red(`Failed to generate: ${error}`));
  }
}

async function manageProjects(manager: ProfileManager) {
  const projects = manager.getProjects();
  const action = await select({
    message: 'Select a project to manage',
    choices: [
      ...projects.map((p) => ({ value: p.id, name: p.name })),
      { value: 'back', name: '⬅️ Back' }
    ]
  });

  if (action === 'back') return;

  const subAction = await select({
    message: 'What would you like to do with this project?',
    choices: [
      { value: 'delete', name: '🗑️ Delete Project' },
      { value: 'back', name: '⬅️ Back' }
    ]
  });

  if (subAction === 'delete') {
    const isConfirmed = await confirm({ 
      message: 'Are you sure you want to delete this project?',
      default: false
    });
    
    if (isConfirmed) {
      manager.deleteProject(action as string);
      p.note(color.yellow('Project deleted.'));
    }
  }
}
