'use client';

import { useState, useEffect } from 'react';
import {
  Container,
  Title,
  Text,
  Card,
  Button,
  PasswordInput,
  TextInput,
  Stack,
  Group,
  Divider,
  Badge,
  Loader,
  Alert,
  MultiSelect,
  Select,
  CloseButton,
  Paper,
  Textarea,
  Accordion,
  FileInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
  IconKey,
  IconBrandGithub,
  IconRobot,
  IconCheck,
  IconX,
  IconRefresh,
  IconSettings,
  IconAlertCircle,
  IconTrash,
  IconBuilding,
  IconUser,
  IconDownload,
  IconUpload,
  IconDatabase,
  IconClock,
} from '@tabler/icons-react';

type AnthropicModel = {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
};

type GitHubRepo = {
  id: number;
  fullName: string;
  name: string;
  owner: string;
  description: string | null;
  private: boolean;
  language: string | null;
  stars: number;
  updatedAt: string;
  url: string;
};

type JiraProject = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  projectTypeKey: string;
  avatarUrl: string | null;
  lead: string | null;
};

type DatabaseBackup = {
  filename: string;
  size: number;
  created: string;
};

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);

  // API Keys state
  const [keysConfigured, setKeysConfigured] = useState({
    anthropic: false,
    github: false,
    jira: false,
  });

  // Fetched data state
  const [anthropicModels, setAnthropicModels] = useState<AnthropicModel[]>([]);
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [jiraProjects, setJiraProjects] = useState<JiraProject[]>([]);

  // Loading states for fetch operations
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchingRepos, setFetchingRepos] = useState(false);
  const [fetchingProjects, setFetchingProjects] = useState(false);

  // Company Framework state
  const [companyFramework, setCompanyFramework] = useState('');
  const [frameworkExists, setFrameworkExists] = useState(false);

  // User Context state
  const [userContext, setUserContext] = useState('');
  const [userContextExists, setUserContextExists] = useState(false);

  // Database backup state
  const [backups, setBackups] = useState<DatabaseBackup[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [backupsLoading, setBackupsLoading] = useState(false);

  // Criteria import state
  const [criteriaFile, setCriteriaFile] = useState<File | null>(null);

  const form = useForm({
    initialValues: {
      anthropicApiKey: '',
      githubToken: '',
      jiraHost: '',
      jiraEmail: '',
      jiraApiToken: '',
      // Selections
      selectedModel: '',
      selectedRepos: [] as string[],
      selectedProjects: [] as string[],
    },
  });

  // Load existing configuration
  useEffect(() => {
    loadConfig();
    loadFramework();
    loadUserContext();
    loadBackups();
  }, []);

  const loadConfig = async () => {
    setConfigLoading(true);
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const configs = await response.json();

        const configMap = configs.reduce((acc: any, config: any) => {
          acc[config.key] = config.value;
          return acc;
        }, {});

        // Check which keys are configured
        setKeysConfigured({
          anthropic: !!configMap.anthropic_api_key,
          github: !!configMap.github_token,
          jira: !!configMap.jira_host && !!configMap.jira_email && !!configMap.jira_api_token,
        });

        // Load selections
        if (configMap.selected_model) {
          form.setFieldValue('selectedModel', configMap.selected_model);
        }
        if (configMap.selected_repos) {
          form.setFieldValue('selectedRepos', configMap.selected_repos || []);
        }
        if (configMap.selected_projects) {
          form.setFieldValue('selectedProjects', configMap.selected_projects || []);
        }
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    } finally {
      setConfigLoading(false);
    }
  };

  const loadFramework = async () => {
    try {
      const response = await fetch('/api/framework');
      if (response.ok) {
        const data = await response.json();
        setCompanyFramework(data.framework || '');
        setFrameworkExists(data.exists);
      }
    } catch (error) {
      console.error('Failed to load framework:', error);
    }
  };

  const saveFramework = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/framework', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ framework: companyFramework }),
      });

      if (response.ok) {
        notifications.show({
          title: 'Success',
          message: 'Company framework saved successfully',
          color: 'green',
        });
        setFrameworkExists(true);
      } else {
        throw new Error('Failed to save framework');
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to save company framework',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadUserContext = async () => {
    try {
      const response = await fetch('/api/user-context');
      if (response.ok) {
        const data = await response.json();
        setUserContext(data.userContext || '');
        setUserContextExists(data.exists);
      }
    } catch (error) {
      console.error('Failed to load user context:', error);
    }
  };

  const saveUserContext = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/user-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userContext }),
      });

      if (response.ok) {
        notifications.show({
          title: 'Success',
          message: 'Developer context saved successfully',
          color: 'green',
        });
        setUserContextExists(true);
      } else {
        throw new Error('Failed to save user context');
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to save developer context',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const saveApiKeys = async () => {
    setLoading(true);
    try {
      const configs = [];

      // Only save non-empty keys
      if (form.values.anthropicApiKey) {
        configs.push({
          key: 'anthropic_api_key',
          value: form.values.anthropicApiKey,
          encrypted: true,
          description: 'Anthropic API Key for Claude AI',
        });
      }

      if (form.values.githubToken) {
        configs.push({
          key: 'github_token',
          value: form.values.githubToken,
          encrypted: true,
          description: 'GitHub Personal Access Token',
        });
      }

      if (form.values.jiraHost) {
        configs.push(
          {
            key: 'jira_host',
            value: form.values.jiraHost,
            encrypted: false,
            description: 'Jira Cloud Host',
          },
          {
            key: 'jira_email',
            value: form.values.jiraEmail,
            encrypted: false,
            description: 'Jira Account Email',
          },
          {
            key: 'jira_api_token',
            value: form.values.jiraApiToken,
            encrypted: true,
            description: 'Jira API Token',
          }
        );
      }

      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configs),
      });

      notifications.show({
        title: 'API Keys Saved',
        message: 'Your API keys have been securely stored',
        color: 'green',
        icon: <IconCheck size={16} />,
      });

      // Reload config to update configured state
      await loadConfig();

      // Clear the input fields after saving
      form.setValues({
        anthropicApiKey: '',
        githubToken: '',
        jiraHost: form.values.jiraHost, // Keep these for convenience
        jiraEmail: form.values.jiraEmail,
        jiraApiToken: '',
        selectedModel: form.values.selectedModel,
        selectedRepos: form.values.selectedRepos,
        selectedProjects: form.values.selectedProjects,
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to save API keys',
        color: 'red',
        icon: <IconX size={16} />,
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAnthropicModels = async () => {
    setFetchingModels(true);
    try {
      const response = await fetch('/api/settings/anthropic/models');
      if (response.ok) {
        const data = await response.json();
        setAnthropicModels(data.models);
        notifications.show({
          title: 'Models Loaded',
          message: `Found ${data.models.length} available models`,
          color: 'green',
        });
      } else {
        const error = await response.json();
        notifications.show({
          title: 'Error',
          message: error.error || 'Failed to fetch models',
          color: 'red',
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to fetch Anthropic models',
        color: 'red',
      });
    } finally {
      setFetchingModels(false);
    }
  };

  const fetchGitHubRepos = async () => {
    setFetchingRepos(true);
    try {
      const response = await fetch('/api/settings/github/repos');
      if (response.ok) {
        const data = await response.json();
        setGithubRepos(data.repositories);
        notifications.show({
          title: 'Repositories Loaded',
          message: `Found ${data.repositories.length} repositories`,
          color: 'green',
        });
      } else {
        const error = await response.json();
        notifications.show({
          title: 'Error',
          message: error.error || 'Failed to fetch repositories',
          color: 'red',
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to fetch GitHub repositories',
        color: 'red',
      });
    } finally {
      setFetchingRepos(false);
    }
  };

  const fetchJiraProjects = async () => {
    setFetchingProjects(true);
    try {
      const response = await fetch('/api/settings/jira/projects');
      if (response.ok) {
        const data = await response.json();
        setJiraProjects(data.projects);
        notifications.show({
          title: 'Projects Loaded',
          message: `Found ${data.projects.length} projects`,
          color: 'green',
        });
      } else {
        const error = await response.json();
        notifications.show({
          title: 'Error',
          message: error.error || 'Failed to fetch projects',
          color: 'red',
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to fetch Jira projects',
        color: 'red',
      });
    } finally {
      setFetchingProjects(false);
    }
  };

  const saveSelections = async () => {
    setLoading(true);
    try {
      const configs = [
        {
          key: 'selected_model',
          value: form.values.selectedModel,
          encrypted: false,
          description: 'Selected Anthropic model',
        },
        {
          key: 'selected_repos',
          value: form.values.selectedRepos,
          encrypted: false,
          description: 'Selected GitHub repositories',
        },
        {
          key: 'selected_projects',
          value: form.values.selectedProjects,
          encrypted: false,
          description: 'Selected Jira projects',
        },
      ];

      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configs),
      });

      notifications.show({
        title: 'Selections Saved',
        message: 'Your selections have been saved',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to save selections',
        color: 'red',
        icon: <IconX size={16} />,
      });
    } finally {
      setLoading(false);
    }
  };

  const removeModel = async () => {
    form.setFieldValue('selectedModel', '');

    try {
      const configs = [{
        key: 'selected_model',
        value: '',
        encrypted: false,
        description: 'Selected Anthropic model',
      }];

      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configs),
      });

      notifications.show({
        title: 'Model Removed',
        message: 'Removed selected model',
        color: 'blue',
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to remove model',
        color: 'red',
      });
    }
  };

  const removeRepo = async (repo: string) => {
    const updated = form.values.selectedRepos.filter(r => r !== repo);
    form.setFieldValue('selectedRepos', updated);

    try {
      const configs = [{
        key: 'selected_repos',
        value: updated,
        encrypted: false,
        description: 'Selected GitHub repositories',
      }];

      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configs),
      });

      notifications.show({
        title: 'Repository Removed',
        message: `Removed ${repo}`,
        color: 'blue',
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to remove repository',
        color: 'red',
      });
    }
  };

  const removeProject = async (projectKey: string) => {
    const updated = form.values.selectedProjects.filter(p => p !== projectKey);
    form.setFieldValue('selectedProjects', updated);

    try {
      const configs = [{
        key: 'selected_projects',
        value: updated,
        encrypted: false,
        description: 'Selected Jira projects',
      }];

      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configs),
      });

      notifications.show({
        title: 'Project Removed',
        message: `Removed ${projectKey}`,
        color: 'blue',
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to remove project',
        color: 'red',
      });
    }
  };

  const loadBackups = async () => {
    setBackupsLoading(true);
    try {
      const response = await fetch('/api/database/backups');
      if (response.ok) {
        const data = await response.json();
        setBackups(data.backups || []);
      }
    } catch (error) {
      console.error('Failed to load backups:', error);
    } finally {
      setBackupsLoading(false);
    }
  };

  const createBackup = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/database/backup', {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        notifications.show({
          title: 'Backup Created',
          message: `Created backup: ${data.filename}`,
          color: 'green',
          icon: <IconCheck size={16} />,
        });
        await loadBackups();
      } else {
        throw new Error('Failed to create backup');
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to create database backup',
        color: 'red',
        icon: <IconX size={16} />,
      });
    } finally {
      setLoading(false);
    }
  };

  const restoreBackup = async (filename: string) => {
    if (!confirm(`Are you sure you want to restore from ${filename}? This will replace the current database. A safety backup will be created automatically.`)) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/database/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });

      if (response.ok) {
        notifications.show({
          title: 'Database Restored',
          message: `Successfully restored from ${filename}. Reloading...`,
          color: 'green',
          icon: <IconCheck size={16} />,
        });
        setSelectedBackup(null);
        await loadBackups();

        // Reload the page after a brief delay
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        throw new Error('Failed to restore backup');
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to restore database',
        color: 'red',
        icon: <IconX size={16} />,
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteBackup = async (filename: string) => {
    if (!confirm(`Are you sure you want to delete the backup ${filename}?`)) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/database/backups/${filename}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        notifications.show({
          title: 'Backup Deleted',
          message: `Deleted backup: ${filename}`,
          color: 'blue',
        });
        if (selectedBackup === filename) {
          setSelectedBackup(null);
        }
        await loadBackups();
      } else {
        throw new Error('Failed to delete backup');
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete backup',
        color: 'red',
        icon: <IconX size={16} />,
      });
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  const importCriteria = async () => {
    if (!criteriaFile) {
      notifications.show({
        title: 'No File Selected',
        message: 'Please select a criteria backup file to import',
        color: 'orange',
      });
      return;
    }

    setLoading(true);
    try {
      // Read the file
      const fileText = await criteriaFile.text();
      const importData = JSON.parse(fileText);

      // Send to import API
      const response = await fetch('/api/criteria/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(importData),
      });

      if (response.ok) {
        const result = await response.json();
        notifications.show({
          title: 'Criteria Imported',
          message: result.message,
          color: 'green',
          icon: <IconCheck size={16} />,
        });
        setCriteriaFile(null);
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to import criteria');
      }
    } catch (error) {
      console.error('Import error:', error);
      notifications.show({
        title: 'Import Failed',
        message: error instanceof Error ? error.message : 'Failed to import criteria',
        color: 'red',
        icon: <IconX size={16} />,
      });
    } finally {
      setLoading(false);
    }
  };

  if (configLoading) {
    return (
      <Container size="xl" py="xl">
        <Group justify="center" mt="xl">
          <Loader size="lg" />
          <Text>Loading settings...</Text>
        </Group>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        <div>
          <Title order={1}>Settings</Title>
          <Text c="dimmed" mt="sm">
            Configure API keys and select resources for your DevTrail instance
          </Text>
        </div>

        <Accordion variant="separated">
          {/* API Keys Configuration */}
          <Accordion.Item value="api-keys">
            <Accordion.Control icon={<IconKey size={20} />}>
              <Group>
                <div>
                  <Text fw={500} size="lg">API Keys</Text>
                  <Text size="sm" c="dimmed">Configure your service credentials</Text>
                </div>
                {(keysConfigured.anthropic || keysConfigured.github || keysConfigured.jira) && (
                  <Badge color="green" size="sm" variant="light">Configured</Badge>
                )}
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">

            <Alert icon={<IconAlertCircle size={16} />} color="blue" variant="light">
              API keys are encrypted and stored securely. They will not be visible after saving.
            </Alert>

            {/* Anthropic Configuration */}
            <Stack gap="md">
              <Group>
                <IconRobot size={18} />
                <Text fw={500}>Anthropic (Claude AI)</Text>
                {keysConfigured.anthropic && (
                  <Badge color="green" size="sm" variant="light">Configured</Badge>
                )}
              </Group>
              <PasswordInput
                label="API Key"
                placeholder="sk-ant-..."
                description="Get your API key from console.anthropic.com"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                autoComplete="off"
                {...form.getInputProps('anthropicApiKey')}
              />
            </Stack>

            <Divider />

            {/* GitHub Configuration */}
            <Stack gap="md">
              <Group>
                <IconBrandGithub size={18} />
                <Text fw={500}>GitHub</Text>
                {keysConfigured.github && (
                  <Badge color="green" size="sm" variant="light">Configured</Badge>
                )}
              </Group>
              <PasswordInput
                label="Personal Access Token"
                placeholder="ghp_..."
                description="Generate a token with 'repo' scope at github.com/settings/tokens"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                autoComplete="off"
                {...form.getInputProps('githubToken')}
              />
            </Stack>

            <Divider />

            {/* Jira Configuration */}
            <Stack gap="md">
              <Group>
                <IconSettings size={18} />
                <Text fw={500}>Jira</Text>
                {keysConfigured.jira && (
                  <Badge color="green" size="sm" variant="light">Configured</Badge>
                )}
              </Group>
              <TextInput
                label="Jira Cloud Host"
                placeholder="your-domain.atlassian.net"
                description="Your Jira Cloud domain (without https://)"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                autoComplete="off"
                {...form.getInputProps('jiraHost')}
              />
              <TextInput
                label="Email"
                placeholder="you@example.com"
                description="Your Atlassian account email"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                autoComplete="off"
                {...form.getInputProps('jiraEmail')}
              />
              <PasswordInput
                label="API Token"
                placeholder="Your API token"
                description="Generate at id.atlassian.com/manage-profile/security/api-tokens"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                autoComplete="off"
                {...form.getInputProps('jiraApiToken')}
              />
            </Stack>

            <Group justify="flex-end">
              <Button
                leftSection={<IconCheck size={16} />}
                onClick={saveApiKeys}
                loading={loading}
              >
                Save API Keys
              </Button>
            </Group>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          {/* Resource Selection */}
          <Accordion.Item value="resources">
            <Accordion.Control icon={<IconSettings size={20} />}>
              <Group>
                <div>
                  <Text fw={500} size="lg">Resource Selection</Text>
                  <Text size="sm" c="dimmed">Fetch and select resources from your configured services</Text>
                </div>
                {(form.values.selectedModel || form.values.selectedRepos.length > 0 || form.values.selectedProjects.length > 0) && (
                  <Badge color="green" size="sm" variant="light">Configured</Badge>
                )}
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">

            {/* Anthropic Models */}
            {keysConfigured.anthropic && (
              <Stack gap="md">
                <Text fw={500}>Anthropic Models</Text>

                {form.values.selectedModel && (
                  <Paper p="sm" withBorder>
                    <Group justify="space-between">
                      <div>
                        <Text size="sm" fw={500}>Currently Selected</Text>
                        <Text size="xs" c="dimmed">
                          {anthropicModels.find(m => m.id === form.values.selectedModel)?.name || form.values.selectedModel}
                        </Text>
                      </div>
                      <CloseButton
                        onClick={removeModel}
                        aria-label="Remove selected model"
                        size="sm"
                      />
                    </Group>
                  </Paper>
                )}

                <Button
                  leftSection={<IconRefresh size={16} />}
                  onClick={fetchAnthropicModels}
                  loading={fetchingModels}
                  variant="light"
                >
                  Fetch Available Models
                </Button>

                {anthropicModels.length > 0 && (
                  <Select
                    label="Default Model"
                    placeholder="Select a model"
                    data={anthropicModels.map((model) => ({
                      value: model.id,
                      label: `${model.name} - ${model.description}`,
                    }))}
                    {...form.getInputProps('selectedModel')}
                  />
                )}
              </Stack>
            )}

            {keysConfigured.anthropic && keysConfigured.github && <Divider />}

            {/* GitHub Repositories */}
            {keysConfigured.github && (
              <Stack gap="md">
                <Text fw={500}>GitHub Repositories</Text>

                {form.values.selectedRepos.length > 0 && (
                  <Paper p="sm" withBorder>
                    <Text size="sm" fw={500} mb="xs">Currently Selected ({form.values.selectedRepos.length})</Text>
                    <Stack gap="xs">
                      {form.values.selectedRepos.map((repo) => (
                        <Group key={repo} justify="space-between" p="xs" style={{ borderRadius: 4, backgroundColor: 'var(--mantine-color-gray-0)' }}>
                          <Text size="sm">{repo}</Text>
                          <CloseButton
                            onClick={() => removeRepo(repo)}
                            aria-label={`Remove ${repo}`}
                            size="sm"
                          />
                        </Group>
                      ))}
                    </Stack>
                  </Paper>
                )}

                <Button
                  leftSection={<IconRefresh size={16} />}
                  onClick={fetchGitHubRepos}
                  loading={fetchingRepos}
                  variant="light"
                >
                  Fetch Repositories
                </Button>

                {githubRepos.length > 0 && (
                  <MultiSelect
                    label="Selected Repositories"
                    placeholder="Select repositories to track"
                    data={githubRepos.map((repo) => ({
                      value: repo.fullName,
                      label: `${repo.fullName}${repo.description ? ` - ${repo.description}` : ''}`,
                    }))}
                    searchable
                    {...form.getInputProps('selectedRepos')}
                  />
                )}
              </Stack>
            )}

            {keysConfigured.github && keysConfigured.jira && <Divider />}

            {/* Jira Projects */}
            {keysConfigured.jira && (
              <Stack gap="md">
                <Text fw={500}>Jira Projects</Text>

                {form.values.selectedProjects.length > 0 && (
                  <Paper p="sm" withBorder>
                    <Text size="sm" fw={500} mb="xs">Currently Selected ({form.values.selectedProjects.length})</Text>
                    <Stack gap="xs">
                      {form.values.selectedProjects.map((projectKey) => {
                        const project = jiraProjects.find(p => p.key === projectKey);
                        return (
                          <Group key={projectKey} justify="space-between" p="xs" style={{ borderRadius: 4, backgroundColor: 'var(--mantine-color-gray-0)' }}>
                            <div>
                              <Text size="sm" fw={500}>{projectKey}</Text>
                              {project && <Text size="xs" c="dimmed">{project.name}</Text>}
                            </div>
                            <CloseButton
                              onClick={() => removeProject(projectKey)}
                              aria-label={`Remove ${projectKey}`}
                              size="sm"
                            />
                          </Group>
                        );
                      })}
                    </Stack>
                  </Paper>
                )}

                <Button
                  leftSection={<IconRefresh size={16} />}
                  onClick={fetchJiraProjects}
                  loading={fetchingProjects}
                  variant="light"
                >
                  Fetch Projects
                </Button>

                {jiraProjects.length > 0 && (
                  <MultiSelect
                    label="Selected Projects"
                    placeholder="Select projects to track"
                    data={jiraProjects.map((project) => ({
                      value: project.key,
                      label: `${project.key} - ${project.name}`,
                    }))}
                    searchable
                    {...form.getInputProps('selectedProjects')}
                  />
                )}
              </Stack>
            )}

            {(anthropicModels.length > 0 || githubRepos.length > 0 || jiraProjects.length > 0) && (
              <Group justify="flex-end">
                <Button
                  leftSection={<IconCheck size={16} />}
                  onClick={saveSelections}
                  loading={loading}
                >
                  Save Selections
                </Button>
              </Group>
            )}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          {/* Company Framework */}
          <Accordion.Item value="framework">
            <Accordion.Control icon={<IconBuilding size={20} />}>
              <Group>
                <div>
                  <Text fw={500} size="lg">Company Framework</Text>
                  <Text size="sm" c="dimmed">
                    Mission, values, and strategic pillars that inform AI analysis
                  </Text>
                </div>
                {frameworkExists && <Badge color="green" size="sm" variant="light">Configured</Badge>}
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">

            <Textarea
              label="Framework Content (Markdown)"
              placeholder="# Company Mission&#10;&#10;Your mission statement...&#10;&#10;## Core Values&#10;...&#10;&#10;## Strategic Pillars&#10;..."
              description="This content provides organizational context for AI-generated reports, goals, and reviews"
              minRows={20}
              maxRows={40}
              autosize
              value={companyFramework}
              onChange={(e) => setCompanyFramework(e.currentTarget.value)}
            />

            <Alert color="blue" icon={<IconAlertCircle size={16} />}>
              This framework will be automatically included in AI prompts to ensure generated content aligns with your organization's mission and values.
            </Alert>

            <Group justify="flex-end">
              <Button
                leftSection={<IconCheck size={16} />}
                onClick={saveFramework}
                loading={loading}
                disabled={!companyFramework.trim()}
              >
                Save Framework
              </Button>
            </Group>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          {/* Developer Context */}
          <Accordion.Item value="dev-context">
            <Accordion.Control icon={<IconUser size={20} />}>
              <Group>
                <div>
                  <Text fw={500} size="lg">Developer Context</Text>
                  <Text size="sm" c="dimmed">
                    Your personal career goals, aspirations, and current role
                  </Text>
                </div>
                {userContextExists && <Badge color="green" size="sm" variant="light">Configured</Badge>}
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">
            <Textarea
              label="Personal Context"
              placeholder="I am a happy senior developer working hard to become a staff engineer. I have a wonderful and supportive team and manager, and I feel fulfilled by my work. I consistently contribute high-quality code, mentor junior developers, and help drive technical decisions that align with our organization's goals."
              description="This helps personalize AI-generated goals, reviews, and reports to align with your career aspirations"
              minRows={15}
              maxRows={35}
              autosize
              value={userContext}
              onChange={(e) => setUserContext(e.currentTarget.value)}
            />

            <Alert color="blue" icon={<IconAlertCircle size={16} />}>
              Your developer context will be used to personalize AI-generated content, ensuring it reflects your career stage, goals, and working style.
            </Alert>

            <Group justify="flex-end">
              <Button
                leftSection={<IconCheck size={16} />}
                onClick={saveUserContext}
                loading={loading}
                disabled={!userContext.trim()}
              >
                Save Developer Context
              </Button>
            </Group>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          {/* Data Management */}
          <Accordion.Item value="data-management">
            <Accordion.Control icon={<IconSettings size={20} />}>
              <Group>
                <div>
                  <Text fw={500} size="lg">Data Management</Text>
                  <Text size="sm" c="dimmed">
                    Backup and export your configuration data
                  </Text>
                </div>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">
                <div>
                  <Text fw={500} mb="xs">Performance Criteria Backup & Restore</Text>
                  <Text size="sm" c="dimmed" mb="md">
                    Download a JSON backup of all your performance review criteria, or restore from a previous backup.
                    This includes all areas of concentration, subareas, descriptions, and PR detectability settings.
                  </Text>

                  <Group>
                    <Button
                      leftSection={<IconDownload size={16} />}
                      variant="light"
                      onClick={async () => {
                      try {
                        const response = await fetch('/api/criteria/export');
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `devtrail-criteria-${new Date().toISOString().split('T')[0]}.json`;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);

                        notifications.show({
                          title: 'Criteria Exported',
                          message: 'Your criteria have been downloaded successfully',
                          color: 'green',
                          icon: <IconCheck size={16} />,
                        });
                      } catch (error) {
                        notifications.show({
                          title: 'Export Failed',
                          message: 'Failed to export criteria',
                          color: 'red',
                          icon: <IconX size={16} />,
                        });
                      }
                    }}
                  >
                    Export Criteria
                  </Button>
                  </Group>

                  <Stack gap="sm" mt="md">
                    <FileInput
                      label="Import Criteria from Backup"
                      placeholder="Select a criteria backup JSON file"
                      description="Upload a previously exported criteria backup file to restore"
                      accept="application/json,.json"
                      value={criteriaFile}
                      onChange={setCriteriaFile}
                      leftSection={<IconUpload size={16} />}
                    />
                    {criteriaFile && (
                      <Group justify="flex-end">
                        <Button
                          variant="light"
                          color="gray"
                          onClick={() => setCriteriaFile(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          leftSection={<IconUpload size={16} />}
                          onClick={importCriteria}
                          loading={loading}
                          color="blue"
                        >
                          Import Criteria
                        </Button>
                      </Group>
                    )}
                  </Stack>
                </div>

                <Alert color="blue" icon={<IconAlertCircle size={16} />} variant="light">
                  <Text size="sm">
                    Keep your backup safe. Importing will update existing criteria with matching IDs and create new ones.
                  </Text>
                </Alert>

                <Divider />

                {/* Database Backup & Restore */}
                <div>
                  <Group mb="xs">
                    <IconDatabase size={18} />
                    <Text fw={500}>Database Backup & Restore</Text>
                  </Group>
                  <Text size="sm" c="dimmed" mb="md">
                    Create backups of your entire database and restore from previous backups. All backups are timestamped
                    and stored locally. Restoring creates an automatic safety backup before replacing the database.
                  </Text>

                  <Stack gap="md">
                    <Group>
                      <Button
                        leftSection={<IconDownload size={16} />}
                        onClick={createBackup}
                        loading={loading}
                        variant="light"
                        color="blue"
                      >
                        Create Backup
                      </Button>
                      <Text size="sm" c="dimmed">
                        {backupsLoading ? (
                          <Loader size="xs" />
                        ) : (
                          `${backups.length} backup${backups.length !== 1 ? 's' : ''} available`
                        )}
                      </Text>
                    </Group>

                    {backups.length > 0 && (
                      <Paper withBorder p="md">
                        <Text size="sm" fw={500} mb="xs">Available Backups</Text>
                        <Stack gap="xs">
                          {backups.map((backup) => (
                            <Paper
                              key={backup.filename}
                              p="sm"
                              withBorder={selectedBackup === backup.filename}
                              style={{
                                backgroundColor: selectedBackup === backup.filename ? 'var(--mantine-color-blue-0)' : 'var(--mantine-color-gray-0)',
                                cursor: 'pointer',
                              }}
                              onClick={() => setSelectedBackup(backup.filename)}
                            >
                              <Group justify="space-between">
                                <div style={{ flex: 1 }}>
                                  <Group gap="xs">
                                    <input
                                      type="radio"
                                      checked={selectedBackup === backup.filename}
                                      onChange={() => setSelectedBackup(backup.filename)}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <IconClock size={14} />
                                    <Text size="xs" style={{ fontFamily: 'monospace' }}>
                                      {formatDate(backup.created)}
                                    </Text>
                                  </Group>
                                  <Text size="xs" c="dimmed" ml={28}>
                                    {formatFileSize(backup.size)}
                                  </Text>
                                </div>
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  color="red"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteBackup(backup.filename);
                                  }}
                                  disabled={loading}
                                >
                                  <IconTrash size={14} />
                                </Button>
                              </Group>
                            </Paper>
                          ))}
                        </Stack>

                        {selectedBackup && (
                          <Group justify="flex-end" mt="md">
                            <Button
                              leftSection={<IconUpload size={16} />}
                              onClick={() => restoreBackup(selectedBackup)}
                              loading={loading}
                              color="green"
                            >
                              Restore Selected Backup
                            </Button>
                          </Group>
                        )}
                      </Paper>
                    )}

                    {backups.length === 0 && !backupsLoading && (
                      <Alert color="gray" variant="light">
                        No backups available. Create your first backup above.
                      </Alert>
                    )}
                  </Stack>
                </div>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </Container>
  );
}
