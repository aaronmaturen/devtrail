/**
 * Google Docs Service
 *
 * Handles creating and updating Google Docs documents using OAuth2 credentials
 * stored in the database.
 */

import { docs, docs_v1, auth as docsAuth } from '@googleapis/docs';
import { drive, drive_v3 } from '@googleapis/drive';
import {
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleRefreshToken,
  getGoogleDefaultFolderId
} from '@/lib/config';

// Types
export interface GoogleDocsClient {
  docs: docs_v1.Docs;
  drive: drive_v3.Drive;
}

export interface CreateDocumentOptions {
  title: string;
  folderId?: string;
}

export interface DocumentContent {
  title: string;
  sections: DocumentSection[];
}

export interface DocumentSection {
  heading?: string;
  headingLevel?: 1 | 2 | 3;
  paragraphs?: string[];
  bulletPoints?: string[];
}

/**
 * Create an authenticated Google API client using stored OAuth credentials
 */
export async function createGoogleClient(): Promise<GoogleDocsClient> {
  const clientId = await getGoogleClientId();
  const clientSecret = await getGoogleClientSecret();
  const refreshToken = await getGoogleRefreshToken();

  const oauth2Client = new docsAuth.OAuth2(
    clientId,
    clientSecret,
    'http://localhost' // redirect URI not needed for refresh token flow
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  const docsClient = docs({ version: 'v1', auth: oauth2Client });
  const driveClient = drive({ version: 'v3', auth: oauth2Client });

  return { docs: docsClient, drive: driveClient };
}

/**
 * Create a new Google Doc
 */
export async function createDocument(
  client: GoogleDocsClient,
  options: CreateDocumentOptions
): Promise<{ documentId: string; documentUrl: string }> {
  // Create the document
  const response = await client.docs.documents.create({
    requestBody: {
      title: options.title,
    },
  });

  const documentId = response.data.documentId!;
  const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;

  // Move to folder if specified
  if (options.folderId) {
    await client.drive.files.update({
      fileId: documentId,
      addParents: options.folderId,
      fields: 'id, parents',
    });
  }

  return { documentId, documentUrl };
}

/**
 * Find an existing document by title in a folder
 */
export async function findDocumentByTitle(
  client: GoogleDocsClient,
  title: string,
  folderId?: string
): Promise<{ documentId: string; documentUrl: string } | null> {
  let query = `name = '${title}' and mimeType = 'application/vnd.google-apps.document' and trashed = false`;

  if (folderId) {
    query += ` and '${folderId}' in parents`;
  }

  const response = await client.drive.files.list({
    q: query,
    fields: 'files(id, name)',
    pageSize: 1,
  });

  if (response.data.files && response.data.files.length > 0) {
    const documentId = response.data.files[0].id!;
    return {
      documentId,
      documentUrl: `https://docs.google.com/document/d/${documentId}/edit`,
    };
  }

  return null;
}

/**
 * Clear all content from a document
 */
export async function clearDocument(
  client: GoogleDocsClient,
  documentId: string
): Promise<void> {
  // Get document to find content length
  const doc = await client.docs.documents.get({ documentId });
  const content = doc.data.body?.content;

  if (!content || content.length <= 1) return;

  // Find the end index (last element before the final newline)
  let endIndex = 1;
  for (const element of content) {
    if (element.endIndex) {
      endIndex = element.endIndex;
    }
  }

  // Don't try to delete if document is essentially empty
  if (endIndex <= 2) return;

  // Delete all content except the required final newline
  await client.docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          deleteContentRange: {
            range: {
              startIndex: 1,
              endIndex: endIndex - 1,
            },
          },
        },
      ],
    },
  });
}

/**
 * Build batch update requests from structured content
 */
function buildInsertRequests(content: DocumentContent): docs_v1.Schema$Request[] {
  const requests: docs_v1.Schema$Request[] = [];
  let currentIndex = 1;

  for (const section of content.sections) {
    // Add heading if present
    if (section.heading) {
      const headingText = section.heading + '\n';
      requests.push({
        insertText: {
          location: { index: currentIndex },
          text: headingText,
        },
      });

      // Apply heading style
      const headingStyle = section.headingLevel === 1 ? 'HEADING_1'
        : section.headingLevel === 2 ? 'HEADING_2'
        : 'HEADING_3';

      requests.push({
        updateParagraphStyle: {
          range: {
            startIndex: currentIndex,
            endIndex: currentIndex + headingText.length,
          },
          paragraphStyle: {
            namedStyleType: headingStyle,
          },
          fields: 'namedStyleType',
        },
      });

      currentIndex += headingText.length;
    }

    // Add paragraphs
    if (section.paragraphs) {
      for (const paragraph of section.paragraphs) {
        const paragraphText = paragraph + '\n\n';
        requests.push({
          insertText: {
            location: { index: currentIndex },
            text: paragraphText,
          },
        });
        currentIndex += paragraphText.length;
      }
    }

    // Add bullet points
    if (section.bulletPoints && section.bulletPoints.length > 0) {
      const bulletStartIndex = currentIndex;

      for (const bullet of section.bulletPoints) {
        const bulletText = bullet + '\n';
        requests.push({
          insertText: {
            location: { index: currentIndex },
            text: bulletText,
          },
        });
        currentIndex += bulletText.length;
      }

      // Apply bullet formatting to all bullet items
      requests.push({
        createParagraphBullets: {
          range: {
            startIndex: bulletStartIndex,
            endIndex: currentIndex,
          },
          bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
        },
      });

      // Add extra newline after bullets
      requests.push({
        insertText: {
          location: { index: currentIndex },
          text: '\n',
        },
      });
      currentIndex += 1;
    }
  }

  return requests;
}

/**
 * Write structured content to a document
 */
export async function writeDocumentContent(
  client: GoogleDocsClient,
  documentId: string,
  content: DocumentContent
): Promise<void> {
  // Clear existing content first
  await clearDocument(client, documentId);

  // Build and execute insert requests
  const requests = buildInsertRequests(content);

  if (requests.length > 0) {
    await client.docs.documents.batchUpdate({
      documentId,
      requestBody: { requests },
    });
  }

  // Update document title if different
  await client.drive.files.update({
    fileId: documentId,
    requestBody: {
      name: content.title,
    },
  });
}

/**
 * Create or update a document with the given content
 * Returns the document URL
 */
export async function syncDocument(
  title: string,
  content: DocumentContent,
  folderId?: string
): Promise<{ documentId: string; documentUrl: string; created: boolean }> {
  const client = await createGoogleClient();

  // Use default folder if not specified
  const targetFolderId = folderId || await getGoogleDefaultFolderId() || undefined;

  // Try to find existing document
  let existing = await findDocumentByTitle(client, title, targetFolderId);
  let created = false;

  if (!existing) {
    // Create new document
    existing = await createDocument(client, { title, folderId: targetFolderId });
    created = true;
  }

  // Write content to document
  await writeDocumentContent(client, existing.documentId, content);

  return {
    documentId: existing.documentId,
    documentUrl: existing.documentUrl,
    created,
  };
}
