import Conf from 'conf';
import { ProjectProfile } from './index';

const schema = {
  projects: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        openapiUrl: { type: 'string' },
        projectRoot: { type: 'string' },
        outputPaths: {
          type: 'object',
          properties: {
            services: { type: 'string' },
            types: { type: 'string' },
            config: { type: 'string' }
          }
        },
        settings: {
          type: 'object',
          properties: {
            stripPrefix: { type: 'string' },
            useHooks: { type: 'boolean' }
          }
        }
      }
    },
    default: []
  }
};

export class ProfileManager {
  private config: Conf<{ projects: ProjectProfile[] }>;

  constructor() {
    this.config = new Conf({
      projectName: 'openapi-to-services',
      schema: schema as any
    });
  }

  getProjects(): ProjectProfile[] {
    return this.config.get('projects') || [];
  }

  saveProject(project: ProjectProfile): void {
    const projects = this.getProjects();
    const index = projects.findIndex((p) => p.id === project.id);
    if (index !== -1) {
      projects[index] = project;
    } else {
      projects.push(project);
    }
    this.config.set('projects', projects);
  }

  deleteProject(id: string): void {
    const projects = this.getProjects();
    const filtered = projects.filter((p) => p.id !== id);
    this.config.set('projects', filtered);
  }

  getProjectById(id: string): ProjectProfile | undefined {
    return this.getProjects().find((p) => p.id === id);
  }
}
