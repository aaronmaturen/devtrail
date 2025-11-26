import { prisma } from '@/lib/db/prisma';

/**
 * Get a configuration value from the database
 * @param key - The configuration key
 * @returns The parsed value or null if not found
 */
export async function getConfigValue(key: string): Promise<string | null> {
  const config = await prisma.config.findUnique({
    where: { key },
  });

  if (!config) {
    return null;
  }

  try {
    const parsed = JSON.parse(config.value);
    // If it's a simple string value, return it directly
    if (typeof parsed === 'string') {
      return parsed;
    }
    // If it's an object or array, return as JSON string
    return config.value;
  } catch {
    // If not valid JSON, return as-is
    return config.value;
  }
}

/**
 * Get a config value and parse it as JSON
 * Returns the default value if not found or parsing fails
 * @param key - The configuration key
 * @param defaultValue - The default value to return if not found
 * @returns The parsed value or default value
 */
export async function getConfigValueParsed<T>(
  key: string,
  defaultValue: T
): Promise<T> {
  const value = await getConfigValue(key);
  if (!value) return defaultValue;

  try {
    return JSON.parse(value) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Set a configuration value in the database
 * @param key - The configuration key
 * @param value - The value to store (will be JSON.stringify'd)
 * @param encrypted - Whether the value should be marked as encrypted
 * @param description - Optional description of the config
 */
export async function setConfigValue(
  key: string,
  value: string | object,
  encrypted: boolean = false,
  description?: string
): Promise<void> {
  await prisma.config.upsert({
    where: { key },
    update: {
      value: JSON.stringify(value),
      encrypted,
      description: description || undefined,
    },
    create: {
      key,
      value: JSON.stringify(value),
      encrypted,
      description: description || undefined,
    },
  });
}

/**
 * Delete a configuration value from the database
 * @param key - The configuration key to delete
 */
export async function deleteConfigValue(key: string): Promise<void> {
  await prisma.config.delete({
    where: { key },
  });
}
