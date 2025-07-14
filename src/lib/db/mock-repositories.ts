// Repositories mockés pour fonctionner sans base de données
import {
  ChatMessage,
  ChatRepository,
  ChatThread,
  Project,
  ThreadAccess,
  EncryptedChatMessage,
} from "app-types/chat";
import { User, UserPreferences, UserRepository } from "app-types/user";

const mockThreads: ChatThread[] = [];
const mockMessages: ChatMessage[] = [];
const mockProjects: Project[] = [];
const mockUsers: Map<string, User> = new Map();
const mockThreadAccess: Map<string, ThreadAccess[]> = new Map();
const mockEncryptedMessages: EncryptedChatMessage[] = [];

const mockUserPreferences: UserPreferences = {
  displayName: "Mock User",
  profession: "Developer",
  responseStyleExample: "Clear and concise",
};

const mockProjectInstructions = {
  systemPrompt: "Mock system prompt",
};

export const mockChatRepository: ChatRepository = {
  insertThread: async (
    thread: Omit<ChatThread, "createdAt">,
  ): Promise<ChatThread> => {
    const newThread = {
      ...thread,
      createdAt: new Date(),
    };
    mockThreads.push(newThread);
    return newThread;
  },
  selectThread: async (
    id: string,
    userId: string,
  ): Promise<ChatThread | null> => {
    const thread = mockThreads.find((t) => t.id === id && t.userId === userId);
    return thread || null;
  },
  selectThreadDetails: async (id: string) => {
    const thread = mockThreads.find((t) => t.id === id);
    if (!thread) return null;
    const messages = await mockChatRepository.selectMessagesByThreadId(
      id,
      thread.userId,
    );
    return {
      ...thread,
      instructions: mockProjectInstructions,
      messages,
      userPreferences: mockUserPreferences,
    };
  },
  selectThreadsByUserId: async (userId: string) => {
    return mockThreads
      .filter((t) => t.userId === userId)
      .map((thread) => ({
        ...thread,
        lastMessageAt: mockMessages
          .filter((m) => m.threadId === thread.id)
          .reduce((max, msg) => Math.max(max, msg.createdAt.getTime()), 0),
        accessType: "owner",
      }));
  },
  updateThread: async (
    id: string,
    thread: Partial<Omit<ChatThread, "id" | "createdAt">>,
  ) => {
    const index = mockThreads.findIndex((t) => t.id === id);
    if (index === -1) throw new Error("Thread not found");
    mockThreads[index] = {
      ...mockThreads[index],
      ...thread,
    };
    return mockThreads[index];
  },
  deleteThread: async (id: string) => {
    const index = mockThreads.findIndex((t) => t.id === id);
    if (index !== -1) mockThreads.splice(index, 1);
    mockMessages.filter((m) => m.threadId !== id);
  },
  insertMessage: async (message: Omit<ChatMessage, "createdAt">) => {
    const newMessage = {
      ...message,
      createdAt: new Date(),
    };
    mockMessages.push(newMessage);
    return newMessage;
  },
  selectMessagesByThreadId: async (threadId: string, userId: string) => {
    // In mock implementation, we'll just check if user has access to the thread
    const thread = mockThreads.find((t) => t.id === threadId);
    if (!thread) return [];

    // Check if user owns the thread or has access
    const hasAccess =
      thread.userId === userId ||
      (mockThreadAccess
        .get(threadId)
        ?.some((access) => access.userId === userId) ??
        false);

    if (!hasAccess) return [];

    return mockMessages.filter((m) => m.threadId === threadId);
  },
  upsertMessage: async (message: Omit<ChatMessage, "createdAt">) => {
    const index = mockMessages.findIndex((m) => m.id === message.id);
    if (index === -1) {
      const newMessage = {
        ...message,
        createdAt: new Date(),
      };
      mockMessages.push(newMessage);
      return newMessage;
    }
    mockMessages[index] = {
      ...mockMessages[index],
      ...message,
    };
    return mockMessages[index];
  },
  deleteMessagesByChatIdAfterTimestamp: async (messageId: string) => {
    const message = mockMessages.find((m) => m.id === messageId);
    if (!message) return;
    const index = mockMessages.findIndex(
      (m) =>
        m.threadId === message.threadId &&
        m.createdAt.getTime() >= message.createdAt.getTime(),
    );
    if (index !== -1) mockMessages.splice(index);
  },
  deleteNonProjectThreads: async (userId: string) => {
    const indices = mockThreads
      .map((t, i) => (t.userId === userId && !t.projectId ? i : -1))
      .filter((i) => i !== -1);
    indices.reverse().forEach((i) => mockThreads.splice(i, 1));
  },
  deleteAllThreads: async (userId: string) => {
    const indices = mockThreads
      .map((t, i) => (t.userId === userId ? i : -1))
      .filter((i) => i !== -1);
    indices.reverse().forEach((i) => mockThreads.splice(i, 1));
  },
  insertProject: async (
    project: Omit<Project, "id" | "createdAt" | "updatedAt">,
  ) => {
    const newProject = {
      ...project,
      id: `mock-project-${mockProjects.length + 1}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockProjects.push(newProject);
    return newProject;
  },
  selectProjectById: async (id: string) => {
    const project = mockProjects.find((p) => p.id === id);
    if (!project) return null;
    const threads = mockThreads.filter((t) => t.projectId === id);
    return { ...project, threads };
  },
  selectProjectsByUserId: async (userId: string) => {
    return mockProjects
      .filter((p) => p.userId === userId)
      .map(({ instructions, ...rest }) => rest);
  },
  updateProject: async (
    id: string,
    project: Partial<Pick<Project, "name" | "instructions">>,
  ) => {
    const index = mockProjects.findIndex((p) => p.id === id);
    if (index === -1) throw new Error("Project not found");
    mockProjects[index] = {
      ...mockProjects[index],
      ...project,
      updatedAt: new Date(),
    };
    return mockProjects[index];
  },
  deleteProject: async (id: string) => {
    const index = mockProjects.findIndex((p) => p.id === id);
    if (index !== -1) mockProjects.splice(index, 1);
    // Delete associated threads
    const threadIndices = mockThreads
      .map((t, i) => (t.projectId === id ? i : -1))
      .filter((i) => i !== -1);
    threadIndices.reverse().forEach((i) => mockThreads.splice(i, 1));
  },
  insertMessages: async (messages: Omit<ChatMessage, "createdAt">[]) => {
    const newMessages = messages.map((message) => ({
      ...message,
      createdAt: new Date(),
    }));
    mockMessages.push(...newMessages);
    return newMessages;
  },
  grantThreadAccess: async (access) => {
    const accessList = mockThreadAccess.get(access.threadId) || [];
    accessList.push(access);
    mockThreadAccess.set(access.threadId, accessList);
  },
  revokeThreadAccess: async (threadId, userId) => {
    const accessList = mockThreadAccess.get(threadId) || [];
    const filteredList = accessList.filter(
      (access) => access.userId !== userId,
    );
    mockThreadAccess.set(threadId, filteredList);
  },
  selectThreadAccess: async (threadId, userId) => {
    const accessList = mockThreadAccess.get(threadId) || [];
    return accessList.find((access) => access.userId === userId) || null;
  },
  deleteChatMessage: async (id: string) => {
    const index = mockMessages.findIndex((m) => m.id === id);
    if (index !== -1) mockMessages.splice(index, 1);
  },
  selectThreadInstructionsByProjectId: async (
    _userId: string,
    projectId: string | undefined,
  ) => {
    return {
      instructions: projectId ? mockProjectInstructions : null,
      userPreferences: mockUserPreferences,
    };
  },
  selectThreadInstructions: async (
    _userId: string,
    threadId: string | undefined,
  ) => {
    const thread = threadId
      ? mockThreads.find((t) => t.id === threadId)
      : undefined;
    return {
      instructions: thread?.projectId ? mockProjectInstructions : null,
      userPreferences: mockUserPreferences,
      threadId: thread?.id,
      projectId: thread?.projectId || undefined,
    };
  },
  insertEncryptedMessage: async (
    message: Omit<EncryptedChatMessage, "createdAt">,
  ): Promise<EncryptedChatMessage> => {
    const newMessage = {
      ...message,
      createdAt: new Date(),
    };
    mockEncryptedMessages.push(newMessage);
    return newMessage;
  },

  selectEncryptedMessage: async (
    id: string,
    _userId: string,
  ): Promise<EncryptedChatMessage | null> => {
    return mockEncryptedMessages.find((m) => m.id === id) || null;
  },

  selectEncryptedMessagesByThreadId: async (
    threadId: string,
    _userId: string,
  ): Promise<EncryptedChatMessage[]> => {
    return mockEncryptedMessages.filter((m) => m.threadId === threadId);
  },
};

export const mockUserRepository: UserRepository = {
  existsByEmail: async (email: string): Promise<boolean> => {
    return Array.from(mockUsers.values()).some((user) => user.email === email);
  },

  updateUser: async (
    id: string,
    user: Pick<User, "name" | "image">,
  ): Promise<User> => {
    const existing = mockUsers.get(id);
    if (!existing) throw new Error("User not found");

    const updated = { ...existing, ...user };
    mockUsers.set(id, updated);
    return updated;
  },

  updatePreferences: async (
    userId: string,
    preferences: UserPreferences,
  ): Promise<User> => {
    const existing = mockUsers.get(userId);
    if (!existing) throw new Error("User not found");

    const updated = { ...existing, preferences };
    mockUsers.set(userId, updated);
    return updated;
  },

  getPreferences: async (userId: string): Promise<UserPreferences | null> => {
    const user = mockUsers.get(userId);
    return user?.preferences || null;
  },

  findById: async (userId: string): Promise<User | null> => {
    return mockUsers.get(userId) || null;
  },
};
