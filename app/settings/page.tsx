'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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
  Select,
  CloseButton,
  Paper,
  Textarea,
  Accordion,
  FileInput,
  Tabs,
  Modal,
  Table,
  Checkbox,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
  IconKey,
  IconBrandGithub,
  IconBrandGoogle,
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
  IconListCheck,
  IconPlus,
} from '@tabler/icons-react';

type AnthropicModel = {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
};

type JiraUser = {
  accountId: string;
  displayName: string;
  emailAddress?: string;
};

type DatabaseBackup = {
  filename: string;
  size: number;
  created: string;
};

type Criterion = {
  id: number;
  type: string;
  areaOfConcentration: string;
  subarea: string;
  description: string;
  prDetectable: boolean;
  _count?: { evidenceCriteria: number };
};

const CRITERION_TYPES = [
  { value: 'junior_engineer', label: 'Software Engineer' },
  { value: 'engineer', label: 'Software Engineer 2' },
  { value: 'mid_engineer', label: 'Software Engineer 3' },
  { value: 'senior_engineer', label: 'Senior Engineer' },
  { value: 'staff_engineer', label: 'Staff Engineer' },
  { value: 'senior_staff_engineer', label: 'Senior Staff Engineer' },
  { value: 'principal_engineer', label: 'Principal Engineer' },
];

function SettingsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);

  // Org-level configuration state
  const [keysConfigured, setKeysConfigured] = useState({
    anthropic: false,
    jira: false,
    google: false,
  });

  // Fetched data state
  const [anthropicModels, setAnthropicModels] = useState<AnthropicModel[]>([]);
  const [jiraUsers, setJiraUsers] = useState<JiraUser[]>([]);

  // Loading states
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchingJiraUsers, setFetchingJiraUsers] = useState(false);

  // Company Framework state (org-level)
  const [companyFramework, setCompanyFramework] = useState('');
  const [frameworkExists, setFrameworkExists] = useState(false);

  // Sync configuration
  const [syncConfig, setSyncConfig] = useState({ githubOrg: '', syncDays: '365' });

  // User settings state
  const [userSettings, setUserSettings] = useState({
    developerContext: '',
    githubUsername: '',
    jiraAccountId: '',
    jiraDisplayName: '',
    email: '',
    name: '',
    jiraMatch: null as { accountId: string; displayName: string; emailAddress?: string } | null,
  });

  // Org-level AI model selection
  const [selectedModel, setSelectedModel] = useState('');

  // Database backup state
  const [backups, setBackups] = useState<DatabaseBackup[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [backupsLoading, setBackupsLoading] = useState(false);

  // Criteria import state
  const [criteriaFile, setCriteriaFile] = useState<File | null>(null);

  // Performance Criteria state
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [criteriaGrouped, setCriteriaGrouped] = useState<Record<string, Criterion[]>>({});
  const [criteriaTypeFilter, setCriteriaTypeFilter] = useState<string>('staff_engineer');
  const [criteriaLoading, setCriteriaLoading] = useState(false);
  const [criteriaModalOpen, setCriteriaModalOpen] = useState(false);

  // Criteria form
  const criteriaForm = useForm({
    initialValues: {
      type: 'staff_engineer',
      areaOfConcentration: '',
      subarea: '',
      description: '',
      prDetectable: true,
    },
  });

  // Org settings form
  const orgForm = useForm({
    initialValues: {
      anthropicApiKey: '',
      jiraHost: '',
      jiraEmail: '',
      jiraApiToken: '',
      googleClientId: '',
      googleClientSecret: '',
      googleDefaultFolderId: '',
    },
  });

  // Load data on mount
  useEffect(() => {
    loadOrgConfig();
    loadFramework();
    loadUserSettings();
    loadBackups();
    loadCriteria();
  }, []);

  // Reload criteria when type filter changes
  useEffect(() => {
    loadCriteria();
  }, [criteriaTypeFilter]);

  // Handle Google OAuth callback
  useEffect(() => {
    const googleAuth = searchParams.get('google_auth');
    const message = searchParams.get('message');

    if (googleAuth === 'success') {
      notifications.show({
        title: 'Google Connected',
        message: 'Successfully connected to Google.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      loadOrgConfig();
      router.replace('/settings');
    } else if (googleAuth === 'error') {
      notifications.show({
        title: 'Google OAuth Failed',
        message: message || 'Failed to connect to Google.',
        color: 'red',
        icon: <IconX size={16} />,
      });
      router.replace('/settings');
    }
  }, [searchParams, router]);

  const loadOrgConfig = async () => {
    setConfigLoading(true);
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const configs = await response.json();
        const configMap = configs.reduce((acc: any, config: any) => {
          acc[config.key] = config.value;
          return acc;
        }, {});

        setKeysConfigured({
          anthropic: !!configMap.anthropic_api_key,
          jira: !!configMap.jira_host && !!configMap.jira_email && !!configMap.jira_api_token,
          google: !!configMap.google_client_id && !!configMap.google_client_secret && !!configMap.google_refresh_token,
        });

        if (configMap.google_default_folder_id) {
          orgForm.setFieldValue('googleDefaultFolderId', configMap.google_default_folder_id);
        }
        if (configMap.jira_host) {
          orgForm.setFieldValue('jiraHost', configMap.jira_host);
        }
        if (configMap.jira_email) {
          orgForm.setFieldValue('jiraEmail', configMap.jira_email);
        }
        if (configMap.github_org || configMap.sync_days) {
          setSyncConfig({
            githubOrg: configMap.github_org || '',
            syncDays: configMap.sync_days || '365',
          });
        }
        if (configMap.selected_model) {
          setSelectedModel(configMap.selected_model);
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

  const loadUserSettings = async () => {
    try {
      const response = await fetch('/api/user/settings');
      if (response.ok) {
        const data = await response.json();
        setUserSettings(data);
      }
    } catch (error) {
      console.error('Failed to load user settings:', error);
    }
  };

  const loadCriteria = async () => {
    setCriteriaLoading(true);
    try {
      const response = await fetch(`/api/criteria?type=${criteriaTypeFilter}`);
      if (response.ok) {
        const data = await response.json();
        setCriteria(data.criteria);
        setCriteriaGrouped(data.grouped);
      }
    } catch (error) {
      console.error('Failed to load criteria:', error);
    } finally {
      setCriteriaLoading(false);
    }
  };

  const createCriterion = async (values: typeof criteriaForm.values) => {
    try {
      const response = await fetch('/api/criteria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (response.ok) {
        notifications.show({ title: 'Success', message: 'Criterion created', color: 'green' });
        criteriaForm.reset();
        setCriteriaModalOpen(false);
        loadCriteria();
      } else {
        throw new Error('Failed to create');
      }
    } catch (error) {
      notifications.show({ title: 'Error', message: 'Failed to create criterion', color: 'red' });
    }
  };

  const deleteCriterion = async (id: number) => {
    if (!confirm('Delete this criterion?')) return;
    try {
      const response = await fetch(`/api/criteria/${id}`, { method: 'DELETE' });
      if (response.ok) {
        notifications.show({ title: 'Deleted', message: 'Criterion removed', color: 'blue' });
        loadCriteria();
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete');
      }
    } catch (error: any) {
      notifications.show({ title: 'Error', message: error.message, color: 'red' });
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
        notifications.show({ title: 'Success', message: 'Company framework saved', color: 'green' });
        setFrameworkExists(true);
      } else {
        throw new Error('Failed to save framework');
      }
    } catch (error) {
      notifications.show({ title: 'Error', message: 'Failed to save company framework', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  const saveUserSettings = async (updates: Partial<typeof userSettings>) => {
    setLoading(true);
    try {
      const response = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        const data = await response.json();
        setUserSettings(prev => ({ ...prev, ...data }));
        notifications.show({ title: 'Success', message: 'Settings saved', color: 'green', icon: <IconCheck size={16} /> });
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      notifications.show({ title: 'Error', message: 'Failed to save settings', color: 'red', icon: <IconX size={16} /> });
    } finally {
      setLoading(false);
    }
  };

  const saveSyncConfig = async () => {
    setLoading(true);
    try {
      const configs = [
        { key: 'github_org', value: syncConfig.githubOrg, encrypted: false, description: 'GitHub organization to sync' },
        { key: 'sync_days', value: syncConfig.syncDays, encrypted: false, description: 'Days of history to sync' },
      ];

      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configs),
      });

      notifications.show({ title: 'Saved', message: 'Sync configuration updated', color: 'green' });
    } catch (error) {
      notifications.show({ title: 'Error', message: 'Failed to save', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  const saveOrgApiKeys = async () => {
    setLoading(true);
    try {
      const configs = [];

      if (orgForm.values.anthropicApiKey) {
        configs.push({ key: 'anthropic_api_key', value: orgForm.values.anthropicApiKey, encrypted: true, description: 'Anthropic API Key' });
      }

      if (orgForm.values.jiraHost) {
        configs.push(
          { key: 'jira_host', value: orgForm.values.jiraHost, encrypted: false, description: 'Jira Cloud Host' },
          { key: 'jira_email', value: orgForm.values.jiraEmail, encrypted: false, description: 'Jira Account Email' },
          { key: 'jira_api_token', value: orgForm.values.jiraApiToken, encrypted: true, description: 'Jira API Token' }
        );
      }

      if (orgForm.values.googleClientId) {
        configs.push({ key: 'google_client_id', value: orgForm.values.googleClientId, encrypted: false, description: 'Google OAuth Client ID' });
      }
      if (orgForm.values.googleClientSecret) {
        configs.push({ key: 'google_client_secret', value: orgForm.values.googleClientSecret, encrypted: true, description: 'Google OAuth Client Secret' });
      }
      if (orgForm.values.googleDefaultFolderId) {
        configs.push({ key: 'google_default_folder_id', value: orgForm.values.googleDefaultFolderId, encrypted: false, description: 'Default Google Drive folder' });
      }

      await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(configs) });

      notifications.show({ title: 'API Keys Saved', message: 'Organization API keys have been saved', color: 'green', icon: <IconCheck size={16} /> });
      await loadOrgConfig();

      orgForm.setValues({
        anthropicApiKey: '',
        jiraHost: orgForm.values.jiraHost,
        jiraEmail: orgForm.values.jiraEmail,
        jiraApiToken: '',
        googleClientId: '',
        googleClientSecret: '',
        googleDefaultFolderId: orgForm.values.googleDefaultFolderId,
      });
    } catch (error) {
      notifications.show({ title: 'Error', message: 'Failed to save API keys', color: 'red', icon: <IconX size={16} /> });
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
        notifications.show({ title: 'Models Loaded', message: `Found ${data.models.length} models`, color: 'green' });
      } else {
        const error = await response.json();
        notifications.show({ title: 'Error', message: error.error || 'Failed to fetch models', color: 'red' });
      }
    } catch (error) {
      notifications.show({ title: 'Error', message: 'Failed to fetch Anthropic models', color: 'red' });
    } finally {
      setFetchingModels(false);
    }
  };

  const fetchJiraUsers = async () => {
    setFetchingJiraUsers(true);
    try {
      const response = await fetch('/api/settings/jira/users');
      if (response.ok) {
        const data = await response.json();
        setJiraUsers(data.users);
      } else {
        const error = await response.json();
        notifications.show({ title: 'Error', message: error.error || 'Failed to fetch Jira users', color: 'red' });
      }
    } catch (error) {
      notifications.show({ title: 'Error', message: 'Failed to fetch Jira users', color: 'red' });
    } finally {
      setFetchingJiraUsers(false);
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
      const response = await fetch('/api/database/backup', { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        notifications.show({ title: 'Backup Created', message: `Created: ${data.filename}`, color: 'green', icon: <IconCheck size={16} /> });
        await loadBackups();
      } else {
        throw new Error('Failed to create backup');
      }
    } catch (error) {
      notifications.show({ title: 'Error', message: 'Failed to create backup', color: 'red', icon: <IconX size={16} /> });
    } finally {
      setLoading(false);
    }
  };

  const restoreBackup = async (filename: string) => {
    if (!confirm(`Restore from ${filename}? This will replace the current database.`)) return;
    setLoading(true);
    try {
      const response = await fetch('/api/database/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      if (response.ok) {
        notifications.show({ title: 'Restored', message: 'Reloading...', color: 'green', icon: <IconCheck size={16} /> });
        setSelectedBackup(null);
        await loadBackups();
        setTimeout(() => window.location.reload(), 2000);
      } else {
        throw new Error('Failed');
      }
    } catch (error) {
      notifications.show({ title: 'Error', message: 'Failed to restore', color: 'red', icon: <IconX size={16} /> });
    } finally {
      setLoading(false);
    }
  };

  const deleteBackup = async (filename: string) => {
    if (!confirm(`Delete ${filename}?`)) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/database/backups/${filename}`, { method: 'DELETE' });
      if (response.ok) {
        notifications.show({ title: 'Deleted', message: filename, color: 'blue' });
        if (selectedBackup === filename) setSelectedBackup(null);
        await loadBackups();
      }
    } catch (error) {
      notifications.show({ title: 'Error', message: 'Failed to delete', color: 'red' });
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

  const formatDate = (dateString: string): string => new Date(dateString).toLocaleString();

  const importCriteria = async () => {
    if (!criteriaFile) {
      notifications.show({ title: 'No File', message: 'Select a file', color: 'orange' });
      return;
    }
    setLoading(true);
    try {
      const fileText = await criteriaFile.text();
      const importData = JSON.parse(fileText);
      const response = await fetch('/api/criteria/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(importData),
      });
      if (response.ok) {
        const result = await response.json();
        notifications.show({ title: 'Imported', message: result.message, color: 'green', icon: <IconCheck size={16} /> });
        setCriteriaFile(null);
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed');
      }
    } catch (error) {
      notifications.show({ title: 'Failed', message: error instanceof Error ? error.message : 'Failed', color: 'red', icon: <IconX size={16} /> });
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
          <Text c="dimmed" mt="sm">Configure your DevTrail instance</Text>
        </div>

        <Tabs defaultValue="user">
          <Tabs.List>
            <Tabs.Tab value="user" leftSection={<IconUser size={16} />}>My Settings</Tabs.Tab>
            <Tabs.Tab value="org" leftSection={<IconBuilding size={16} />}>Organization</Tabs.Tab>
            <Tabs.Tab value="criteria" leftSection={<IconListCheck size={16} />}>Criteria</Tabs.Tab>
          </Tabs.List>

          {/* User Settings Tab */}
          <Tabs.Panel value="user" pt="xl">
            <Stack gap="lg">
              {/* GitHub Connection */}
              <Card withBorder>
                <Stack gap="md">
                  <Group>
                    <IconBrandGithub size={24} />
                    <div>
                      <Text fw={500} size="lg">GitHub Connection</Text>
                      <Text size="sm" c="dimmed">Your GitHub identity for PR attribution</Text>
                    </div>
                    <Badge color="green" variant="light" ml="auto">Connected</Badge>
                  </Group>

                  {userSettings.githubUsername ? (
                    <Alert color="green" variant="light" icon={<IconCheck size={16} />}>
                      Connected as <strong>@{userSettings.githubUsername}</strong>. PRs you author will be automatically attributed to you.
                    </Alert>
                  ) : (
                    <Alert color="yellow" variant="light" icon={<IconAlertCircle size={16} />}>
                      GitHub username not found. Please sign out and sign in again.
                    </Alert>
                  )}
                </Stack>
              </Card>

              {/* Jira Identity */}
              {keysConfigured.jira && (
                <Card withBorder>
                  <Stack gap="md">
                    <Group>
                      <IconSettings size={24} />
                      <div>
                        <Text fw={500} size="lg">Jira Identity</Text>
                        <Text size="sm" c="dimmed">Link your Jira account for ticket attribution</Text>
                      </div>
                      {userSettings.jiraAccountId && <Badge color="green" variant="light" ml="auto">Linked</Badge>}
                    </Group>

                    {userSettings.jiraAccountId ? (
                      <Alert color="green" variant="light" icon={<IconCheck size={16} />}>
                        Linked as <strong>{userSettings.jiraDisplayName || 'Jira User'}</strong>. Tickets assigned to you will be automatically attributed.
                      </Alert>
                    ) : userSettings.jiraMatch ? (
                      <Alert color="green" variant="light" icon={<IconCheck size={16} />}>
                        <Group justify="space-between" wrap="nowrap">
                          <div>
                            <Text size="sm" fw={500}>Found your Jira account:</Text>
                            <Text size="sm">{userSettings.jiraMatch.displayName} {userSettings.jiraMatch.emailAddress && `(${userSettings.jiraMatch.emailAddress})`}</Text>
                          </div>
                          <Button
                            size="xs"
                            onClick={() => saveUserSettings({ jiraAccountId: userSettings.jiraMatch!.accountId })}
                          >
                            Link Account
                          </Button>
                        </Group>
                      </Alert>
                    ) : (
                      <Alert color="blue" variant="light" icon={<IconAlertCircle size={16} />}>
                        No matching Jira account found. Search manually below.
                      </Alert>
                    )}

                    {!userSettings.jiraAccountId && !userSettings.jiraMatch && (
                      <>
                        <Button
                          leftSection={<IconRefresh size={16} />}
                          onClick={fetchJiraUsers}
                          loading={fetchingJiraUsers}
                          variant="light"
                        >
                          Search Jira Users
                        </Button>

                        {jiraUsers.length > 0 && (
                          <Select
                            placeholder="Select your Jira account"
                            data={jiraUsers.map((user) => ({
                              value: user.accountId,
                              label: `${user.displayName}${user.emailAddress ? ` (${user.emailAddress})` : ''}`,
                            }))}
                            value={userSettings.jiraAccountId}
                            onChange={(value) => saveUserSettings({ jiraAccountId: value || '' })}
                            searchable
                          />
                        )}
                      </>
                    )}
                  </Stack>
                </Card>
              )}

              {/* Developer Context */}
              <Card withBorder>
                <Stack gap="md">
                  <Group>
                    <IconUser size={24} />
                    <div>
                      <Text fw={500} size="lg">Developer Context</Text>
                      <Text size="sm" c="dimmed">Your personal career goals and aspirations</Text>
                    </div>
                    {userSettings.developerContext && <Badge color="green" size="sm" variant="light" ml="auto">Configured</Badge>}
                  </Group>

                  <Textarea
                    placeholder="I am a senior developer working to become a staff engineer..."
                    description="Helps personalize AI-generated goals, reviews, and reports"
                    minRows={8}
                    maxRows={20}
                    autosize
                    value={userSettings.developerContext}
                    onChange={(e) => setUserSettings(prev => ({ ...prev, developerContext: e.currentTarget.value }))}
                  />

                  <Group justify="flex-end">
                    <Button
                      leftSection={<IconCheck size={16} />}
                      onClick={() => saveUserSettings({ developerContext: userSettings.developerContext })}
                      loading={loading}
                      disabled={!userSettings.developerContext.trim()}
                    >
                      Save Context
                    </Button>
                  </Group>
                </Stack>
              </Card>
            </Stack>
          </Tabs.Panel>

          {/* Organization Settings Tab */}
          <Tabs.Panel value="org" pt="xl">
            <Accordion variant="separated">
              {/* API Keys */}
              <Accordion.Item value="api-keys">
                <Accordion.Control icon={<IconKey size={20} />}>
                  <Group>
                    <div>
                      <Text fw={500} size="lg">API Keys</Text>
                      <Text size="sm" c="dimmed">Organization-wide service credentials</Text>
                    </div>
                    {(keysConfigured.anthropic || keysConfigured.jira) && <Badge color="green" size="sm" variant="light">Configured</Badge>}
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="md">
                    <Alert icon={<IconAlertCircle size={16} />} color="blue" variant="light">
                      API keys are encrypted and stored securely.
                    </Alert>

                    {/* Anthropic */}
                    <Stack gap="md">
                      <Group>
                        <IconRobot size={18} />
                        <Text fw={500}>Anthropic (Claude AI)</Text>
                        {keysConfigured.anthropic && <Badge color="green" size="sm" variant="light">Configured</Badge>}
                      </Group>
                      <PasswordInput
                        label="API Key"
                        placeholder={keysConfigured.anthropic ? '************' : 'sk-ant-...'}
                        description={keysConfigured.anthropic ? 'Enter a new key to replace it.' : 'Get your API key from console.anthropic.com'}
                        {...orgForm.getInputProps('anthropicApiKey')}
                      />
                    </Stack>

                    <Divider />

                    {/* Jira */}
                    <Stack gap="md">
                      <Group>
                        <IconSettings size={18} />
                        <Text fw={500}>Jira</Text>
                        {keysConfigured.jira && <Badge color="green" size="sm" variant="light">Configured</Badge>}
                      </Group>
                      <TextInput label="Jira Cloud Host" placeholder="your-domain.atlassian.net" {...orgForm.getInputProps('jiraHost')} />
                      <TextInput label="Email" placeholder="you@example.com" {...orgForm.getInputProps('jiraEmail')} />
                      <PasswordInput
                        label="API Token"
                        placeholder={keysConfigured.jira ? '************' : 'Your API token'}
                        {...orgForm.getInputProps('jiraApiToken')}
                      />
                    </Stack>

                    <Divider />

                    {/* Google */}
                    <Stack gap="md">
                      <Group>
                        <IconBrandGoogle size={18} />
                        <Text fw={500}>Google Docs/Drive</Text>
                        {keysConfigured.google && <Badge color="green" size="sm" variant="light">Connected</Badge>}
                      </Group>
                      <TextInput label="OAuth Client ID" placeholder="your-client-id.apps.googleusercontent.com" {...orgForm.getInputProps('googleClientId')} />
                      <PasswordInput label="OAuth Client Secret" placeholder="GOCSPX-..." {...orgForm.getInputProps('googleClientSecret')} />
                      <Button
                        component="a"
                        href="/api/auth/google"
                        variant={keysConfigured.google ? 'light' : 'filled'}
                        color={keysConfigured.google ? 'gray' : 'blue'}
                        leftSection={<IconBrandGoogle size={16} />}
                      >
                        {keysConfigured.google ? 'Re-authorize' : 'Connect with Google'}
                      </Button>
                      <TextInput label="Default Folder ID (Optional)" placeholder="1AbCdEfGhIjKlMnOpQrStUvWxYz" {...orgForm.getInputProps('googleDefaultFolderId')} />
                    </Stack>

                    <Group justify="flex-end">
                      <Button leftSection={<IconCheck size={16} />} onClick={saveOrgApiKeys} loading={loading}>Save API Keys</Button>
                    </Group>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>

              {/* AI Model */}
              {keysConfigured.anthropic && (
                <Accordion.Item value="ai-model">
                  <Accordion.Control icon={<IconRobot size={20} />}>
                    <Group>
                      <div>
                        <Text fw={500} size="lg">AI Model</Text>
                        <Text size="sm" c="dimmed">Claude model for AI-powered features</Text>
                      </div>
                      {selectedModel && <Badge color="green" size="sm" variant="light">Configured</Badge>}
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="md">
                      {selectedModel && (
                        <Paper p="sm" withBorder>
                          <Group justify="space-between">
                            <div>
                              <Text size="sm" fw={500}>Currently Selected</Text>
                              <Text size="xs" c="dimmed">
                                {anthropicModels.find(m => m.id === selectedModel)?.name || selectedModel}
                              </Text>
                            </div>
                            <CloseButton size="sm" onClick={async () => {
                              await fetch('/api/config', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify([{ key: 'selected_model', value: '', encrypted: false }]),
                              });
                              setSelectedModel('');
                            }} />
                          </Group>
                        </Paper>
                      )}

                      <Button leftSection={<IconRefresh size={16} />} onClick={fetchAnthropicModels} loading={fetchingModels} variant="light">
                        Fetch Available Models
                      </Button>

                      {anthropicModels.length > 0 && (
                        <Select
                          placeholder="Select a model"
                          data={anthropicModels.map((model) => ({ value: model.id, label: `${model.name} - ${model.description}` }))}
                          value={selectedModel}
                          onChange={async (value) => {
                            if (value) {
                              await fetch('/api/config', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify([{ key: 'selected_model', value, encrypted: false, description: 'Selected AI model' }]),
                              });
                              setSelectedModel(value);
                              notifications.show({ title: 'Saved', message: 'AI model updated', color: 'green' });
                            }
                          }}
                        />
                      )}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* Sync Configuration */}
              <Accordion.Item value="sync-config">
                <Accordion.Control icon={<IconRefresh size={20} />}>
                  <Group>
                    <div>
                      <Text fw={500} size="lg">Sync Configuration</Text>
                      <Text size="sm" c="dimmed">GitHub organization and sync timeframe</Text>
                    </div>
                    {syncConfig.githubOrg && <Badge color="green" size="sm" variant="light">Configured</Badge>}
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="md">
                    <Alert icon={<IconAlertCircle size={16} />} color="blue" variant="light">
                      All repositories in the organization will be scanned. PRs and Jira tickets are automatically attributed to users based on author/assignee.
                    </Alert>

                    <TextInput
                      label="GitHub Organization"
                      placeholder="presencelearning"
                      description="All repositories in this org will be included in sync"
                      value={syncConfig.githubOrg}
                      onChange={(e) => setSyncConfig({ ...syncConfig, githubOrg: e.currentTarget.value })}
                    />

                    <Select
                      label="Sync Timeframe"
                      description="How far back to sync on first login"
                      data={[
                        { value: '30', label: 'Last 30 days' },
                        { value: '90', label: 'Last 90 days' },
                        { value: '180', label: 'Last 6 months' },
                        { value: '365', label: 'Last year' },
                      ]}
                      value={syncConfig.syncDays}
                      onChange={(value) => setSyncConfig({ ...syncConfig, syncDays: value || '365' })}
                    />

                    <Group justify="flex-end">
                      <Button leftSection={<IconCheck size={16} />} onClick={saveSyncConfig} loading={loading}>
                        Save Sync Configuration
                      </Button>
                    </Group>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>

              {/* Company Framework */}
              <Accordion.Item value="framework">
                <Accordion.Control icon={<IconBuilding size={20} />}>
                  <Group>
                    <div>
                      <Text fw={500} size="lg">Company Framework</Text>
                      <Text size="sm" c="dimmed">Mission, values, and strategic pillars</Text>
                    </div>
                    {frameworkExists && <Badge color="green" size="sm" variant="light">Configured</Badge>}
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="md">
                    <Textarea
                      label="Framework Content (Markdown)"
                      placeholder="# Company Mission&#10;&#10;Your mission statement..."
                      description="Organizational context for AI-generated reports"
                      minRows={15}
                      maxRows={30}
                      autosize
                      value={companyFramework}
                      onChange={(e) => setCompanyFramework(e.currentTarget.value)}
                    />
                    <Group justify="flex-end">
                      <Button leftSection={<IconCheck size={16} />} onClick={saveFramework} loading={loading} disabled={!companyFramework.trim()}>
                        Save Framework
                      </Button>
                    </Group>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>

              {/* Data Management */}
              <Accordion.Item value="data-management">
                <Accordion.Control icon={<IconDatabase size={20} />}>
                  <Group>
                    <div>
                      <Text fw={500} size="lg">Data Management</Text>
                      <Text size="sm" c="dimmed">Backup, restore, and export data</Text>
                    </div>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="md">
                    {/* Criteria Export/Import */}
                    <div>
                      <Text fw={500} mb="xs">Performance Criteria</Text>
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
                              notifications.show({ title: 'Exported', message: 'Criteria downloaded', color: 'green' });
                            } catch (error) {
                              notifications.show({ title: 'Error', message: 'Failed to export', color: 'red' });
                            }
                          }}
                        >
                          Export Criteria
                        </Button>
                      </Group>

                      <Stack gap="sm" mt="md">
                        <FileInput
                          label="Import Criteria"
                          placeholder="Select a criteria backup JSON file"
                          accept="application/json,.json"
                          value={criteriaFile}
                          onChange={setCriteriaFile}
                          leftSection={<IconUpload size={16} />}
                        />
                        {criteriaFile && (
                          <Group justify="flex-end">
                            <Button variant="light" color="gray" onClick={() => setCriteriaFile(null)}>Cancel</Button>
                            <Button leftSection={<IconUpload size={16} />} onClick={importCriteria} loading={loading}>Import</Button>
                          </Group>
                        )}
                      </Stack>
                    </div>

                    <Divider />

                    {/* Database Backup */}
                    <div>
                      <Group mb="xs">
                        <IconDatabase size={18} />
                        <Text fw={500}>Database Backup & Restore</Text>
                      </Group>

                      <Stack gap="md">
                        <Group>
                          <Button leftSection={<IconDownload size={16} />} onClick={createBackup} loading={loading} variant="light">Create Backup</Button>
                          <Text size="sm" c="dimmed">{backupsLoading ? <Loader size="xs" /> : `${backups.length} backup${backups.length !== 1 ? 's' : ''}`}</Text>
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
                                  style={{ backgroundColor: selectedBackup === backup.filename ? 'var(--mantine-color-blue-0)' : 'var(--mantine-color-gray-0)', cursor: 'pointer' }}
                                  onClick={() => setSelectedBackup(backup.filename)}
                                >
                                  <Group justify="space-between">
                                    <div style={{ flex: 1 }}>
                                      <Group gap="xs">
                                        <input type="radio" checked={selectedBackup === backup.filename} onChange={() => setSelectedBackup(backup.filename)} onClick={(e) => e.stopPropagation()} />
                                        <IconClock size={14} />
                                        <Text size="xs" style={{ fontFamily: 'monospace' }}>{formatDate(backup.created)}</Text>
                                      </Group>
                                      <Text size="xs" c="dimmed" ml={28}>{formatFileSize(backup.size)}</Text>
                                    </div>
                                    <Button size="xs" variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); deleteBackup(backup.filename); }} disabled={loading}>
                                      <IconTrash size={14} />
                                    </Button>
                                  </Group>
                                </Paper>
                              ))}
                            </Stack>
                            {selectedBackup && (
                              <Group justify="flex-end" mt="md">
                                <Button leftSection={<IconUpload size={16} />} onClick={() => restoreBackup(selectedBackup)} loading={loading} color="green">Restore</Button>
                              </Group>
                            )}
                          </Paper>
                        )}
                      </Stack>
                    </div>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </Tabs.Panel>

          {/* Criteria Tab */}
          <Tabs.Panel value="criteria" pt="xl">
            <Stack gap="lg">
              {/* Header */}
              <Group justify="space-between">
                <div>
                  <Title order={2}>Performance Review Criteria</Title>
                  <Text c="dimmed" mt="xs">
                    Criteria used for evaluating PRs and evidence
                  </Text>
                </div>
                <Group>
                  <Select
                    data={CRITERION_TYPES}
                    value={criteriaTypeFilter}
                    onChange={(v) => setCriteriaTypeFilter(v || 'staff_engineer')}
                    w={180}
                  />
                  <Button
                    leftSection={<IconPlus size={18} />}
                    onClick={() => {
                      criteriaForm.setFieldValue('type', criteriaTypeFilter);
                      setCriteriaModalOpen(true);
                    }}
                  >
                    Add Criterion
                  </Button>
                </Group>
              </Group>

              {/* Stats Cards */}
              <Group>
                <Card withBorder padding="md" radius="md" style={{ flex: 1 }}>
                  <Text size="sm" c="dimmed" tt="uppercase" fw={700}>Total Criteria</Text>
                  <Text size="xl" fw={700} mt="xs">{criteria.length}</Text>
                </Card>
                <Card withBorder padding="md" radius="md" style={{ flex: 1 }}>
                  <Text size="sm" c="dimmed" tt="uppercase" fw={700}>PR Detectable</Text>
                  <Text size="xl" fw={700} mt="xs">{criteria.filter((c) => c.prDetectable).length}</Text>
                </Card>
                <Card withBorder padding="md" radius="md" style={{ flex: 1 }}>
                  <Text size="sm" c="dimmed" tt="uppercase" fw={700}>Areas of Focus</Text>
                  <Text size="xl" fw={700} mt="xs">{Object.keys(criteriaGrouped).length}</Text>
                </Card>
              </Group>

              {/* Criteria Grouped by Area */}
              {criteriaLoading ? (
                <Group justify="center" py="xl"><Loader size="lg" /></Group>
              ) : criteria.length === 0 ? (
                <Alert color="blue" variant="light" icon={<IconAlertCircle size={16} />}>
                  No criteria defined for {CRITERION_TYPES.find(t => t.value === criteriaTypeFilter)?.label}. Add criteria or import from the Data Management section.
                </Alert>
              ) : (
                <Accordion variant="separated" multiple defaultValue={Object.keys(criteriaGrouped)}>
                  {Object.entries(criteriaGrouped).map(([area, areaCriteria]) => (
                    <Accordion.Item key={area} value={area}>
                      <Accordion.Control>
                        <Group>
                          <Text fw={600}>{area}</Text>
                          <Badge size="sm" variant="light">{areaCriteria.length} criteria</Badge>
                        </Group>
                      </Accordion.Control>
                      <Accordion.Panel>
                        <Table striped highlightOnHover>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>Subarea</Table.Th>
                              <Table.Th>Description</Table.Th>
                              <Table.Th>PR Detectable</Table.Th>
                              <Table.Th>Evidence Count</Table.Th>
                              <Table.Th>Actions</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {areaCriteria.map((c) => (
                              <Table.Tr key={c.id}>
                                <Table.Td><Text size="sm" fw={500}>{c.subarea}</Text></Table.Td>
                                <Table.Td><Text size="sm" lineClamp={2}>{c.description}</Text></Table.Td>
                                <Table.Td>
                                  <Badge color={c.prDetectable ? 'green' : 'gray'} variant="light" leftSection={c.prDetectable ? <IconCheck size={14} /> : <IconX size={14} />}>
                                    {c.prDetectable ? 'Yes' : 'No'}
                                  </Badge>
                                </Table.Td>
                                <Table.Td><Badge variant="light">{c._count?.evidenceCriteria || 0}</Badge></Table.Td>
                                <Table.Td>
                                  <Button
                                    size="xs"
                                    variant="light"
                                    color="red"
                                    onClick={() => deleteCriterion(c.id)}
                                    disabled={(c._count?.evidenceCriteria || 0) > 0}
                                  >
                                    <IconTrash size={14} />
                                  </Button>
                                </Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </Accordion.Panel>
                    </Accordion.Item>
                  ))}
                </Accordion>
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>

        {/* Add Criterion Modal */}
        <Modal
          opened={criteriaModalOpen}
          onClose={() => { setCriteriaModalOpen(false); criteriaForm.reset(); }}
          title="Add New Criterion"
          size="lg"
        >
          <form onSubmit={criteriaForm.onSubmit(createCriterion)}>
            <Stack>
              <Select
                label="Engineer Level"
                data={CRITERION_TYPES}
                required
                {...criteriaForm.getInputProps('type')}
              />
              <TextInput
                label="Area of Concentration"
                placeholder="e.g., Engineering Experience, Delivery"
                required
                {...criteriaForm.getInputProps('areaOfConcentration')}
              />
              <TextInput
                label="Subarea"
                placeholder="e.g., Quality & testing, Project management"
                required
                {...criteriaForm.getInputProps('subarea')}
              />
              <Textarea
                label="Description"
                placeholder="Detailed description of this criterion..."
                required
                minRows={4}
                {...criteriaForm.getInputProps('description')}
              />
              <Checkbox
                label="PR Detectable (can be identified in pull requests)"
                {...criteriaForm.getInputProps('prDetectable', { type: 'checkbox' })}
              />
              <Group justify="flex-end" mt="md">
                <Button variant="subtle" onClick={() => { setCriteriaModalOpen(false); criteriaForm.reset(); }}>
                  Cancel
                </Button>
                <Button type="submit" leftSection={<IconPlus size={16} />}>
                  Create Criterion
                </Button>
              </Group>
            </Stack>
          </form>
        </Modal>
      </Stack>
    </Container>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<Loader />}>
      <SettingsPageContent />
    </Suspense>
  );
}
