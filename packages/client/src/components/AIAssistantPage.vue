<template>
  <main class="ai-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">workgaga AI</div>
        <h1>AI 助手</h1>
        <p>
          围绕你要推进的事情工作，必要时自然生成文档、待办、日程和知识沉淀。
        </p>
      </div>
      <div class="header-stats">
        <div>
          <strong>{{ taskCounts.total }}</strong
          ><span>任务</span>
        </div>
        <div>
          <strong>{{ taskCounts.running }}</strong
          ><span>进行中</span>
        </div>
        <div>
          <strong>{{ enabledSkills.length }}</strong
          ><span>Skill</span>
        </div>
        <div>
          <strong>{{ enabledAgents.length }}</strong
          ><span>Agent</span>
        </div>
        <div>
          <strong>{{ activeChannel?.model ?? "未设置" }}</strong
          ><span>当前渠道模型</span>
        </div>
      </div>
    </header>

    <section class="workspace-grid">
      <aside class="left-rail">
        <section class="card">
          <div class="section-title">当前上下文</div>
          <div class="meta-row">
            <span>当前文档</span><strong>{{ currentFileName }}</strong>
          </div>
          <div class="meta-row">
            <span>当前知识库</span
            ><strong>{{ knowledgeGraphStore.vaultName || "未打开" }}</strong>
          </div>
          <div class="mini-grid">
            <div>
              <strong>{{ knowledgeGraphStore.noteCount }}</strong
              ><span>文档</span>
            </div>
            <div>
              <strong>{{ knowledgeGraphStore.linkCount }}</strong
              ><span>连接</span>
            </div>
            <div>
              <strong>{{ knowledgeGraphStore.missingCount }}</strong
              ><span>缺失</span>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="section-title">快捷能力</div>
          <button
            v-for="action in quickActions"
            :key="action"
            class="quick-btn"
            @click="useQuickAction(action)"
          >
            {{ action }}
          </button>
        </section>

        <section class="card compact-card">
          <div class="section-header">
            <div>
              <div class="section-title">Skill</div>
              <p>{{ enabledSkills.length }} 个已启用</p>
            </div>
            <button @click="activeTab = 'skills'">管理</button>
          </div>
          <div class="chip-list">
            <span v-for="skill in enabledSkills.slice(0, 5)" :key="skill.id">{{
              skill.name
            }}</span>
          </div>
        </section>

        <section class="card compact-card">
          <div class="section-header">
            <div>
              <div class="section-title">Agent</div>
              <p>{{ enabledAgents.length }} 个已启用</p>
            </div>
            <button @click="activeTab = 'agents'">管理</button>
          </div>
          <div class="chip-list">
            <span v-for="agent in enabledAgents.slice(0, 5)" :key="agent.id">{{
              agent.name
            }}</span>
          </div>
        </section>
      </aside>

      <section class="center-stage">
        <nav class="tab-bar">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </nav>

        <section
          v-if="activeTab === 'chat'"
          class="panel-section chat-workbench"
        >
          <aside class="conversation-history-panel">
            <div class="conversation-panel-head">
              <div>
                <div class="section-title">历史会话</div>
                <p>选择一个任务继续对话，或新建一个任务。</p>
              </div>
              <button
                class="primary-btn compact-btn"
                type="button"
                @click="showNewTaskPanel = !showNewTaskPanel"
              >
                {{ showNewTaskPanel ? "收起" : "新建" }}
              </button>
            </div>

            <div v-if="showNewTaskPanel" class="new-task-panel">
              <textarea
                v-model="userInput"
                placeholder="描述你要推进的新任务，例如：准备一次沟通、规划项目、整理想法..."
                @keydown.meta.enter="sendDirectPrompt"
                @keydown.ctrl.enter="sendDirectPrompt"
              />
              <label>
                <span>本次大模型</span>
                <select v-model="selectedDirectChannelId">
                  <option
                    v-for="channel in channels"
                    :key="channel.id"
                    :value="channel.id"
                  >
                    {{ channelOptionLabel(channel) }}
                  </option>
                </select>
              </label>
              <div class="send-skill-picker compact-skill-picker">
                <span class="send-skill-label">初始 Skill：</span>
                <button
                  v-for="skill in enabledSkills"
                  :key="skill.id"
                  type="button"
                  class="send-skill-chip"
                  :class="{ active: selectedSendSkillIds.includes(skill.id) }"
                  @click="toggleSendSkill(skill.id)"
                >
                  {{ skill.name }}
                </button>
                <span v-if="!enabledSkills.length" class="send-skill-empty"
                  >暂无可用 Skill</span
                >
              </div>
              <button
                class="primary-btn full-btn"
                :disabled="!userInput.trim() || sendingDirectly"
                @click="sendDirectPrompt"
              >
                {{ sendingDirectly ? "创建并发送中..." : "创建新对话" }}
              </button>
              <div v-if="directSendError" class="conversation-error">
                {{ directSendError }}
              </div>
            </div>

            <div class="conversation-list">
              <button
                v-for="task in sortedTasks"
                :key="task.id"
                type="button"
                class="conversation-list-item"
                :class="{ active: selectedTaskId === task.id }"
                @click="selectTask(task.id)"
              >
                <strong>{{ task.title }}</strong>
                <span>{{ task.progressText }}</span>
                <small
                  >{{ statusText(task.status) }} ·
                  {{
                    task.outputKinds.map(outputKindText).join("、") ||
                    "直接回答"
                  }}</small
                >
              </button>
              <div
                v-if="!sortedTasks.length"
                class="conversation-empty compact-empty"
              >
                还没有历史会话，点击“新建”开始第一个任务。
              </div>
            </div>
          </aside>

          <article class="current-conversation-panel">
            <template v-if="selectedTask">
              <div class="detail-header conversation-titlebar">
                <div>
                  <div class="section-title">当前对话</div>
                  <h2>{{ selectedTask.title }}</h2>
                  <p>{{ selectedTask.progressText }}</p>
                </div>
                <span class="status" :class="selectedTask.status">{{
                  statusText(selectedTask.status)
                }}</span>
              </div>

              <div class="conversation-area focused-conversation-area">
                <div class="conversation-messages focused-messages">
                  <div
                    v-if="!conversationMessages.length"
                    class="conversation-empty"
                  >
                    还没有对话记录，在底部输入框继续与 AI 协作。
                  </div>
                  <div
                    v-if="
                      conversationMessages.length >
                      conversationCompressThreshold
                    "
                    class="conversation-compressed-hint"
                  >
                    早期
                    {{
                      conversationMessages.length - conversationKeepRecent
                    }}
                    条消息已压缩，仅展示最近
                    {{
                      Math.min(
                        conversationMessages.length,
                        conversationKeepRecent,
                      )
                    }}
                    条。
                    <span
                      v-if="conversationSummaryStatus === 'generating'"
                      class="summary-status generating"
                      >正在生成智能摘要...</span
                    >
                    <span
                      v-else-if="conversationSummaryStatus === 'ready'"
                      class="summary-status ready"
                      >智能摘要已就绪</span
                    >
                  </div>
                  <div
                    v-for="message in visibleConversationMessages"
                    :key="message.id"
                    class="conversation-message"
                    :class="[message.role, message.status]"
                  >
                    <div class="conversation-meta">
                      <strong>{{
                        message.role === "assistant" ? "AI" : "你"
                      }}</strong>
                      <span>{{
                        message.status === "sending" ||
                        message.status === "streaming"
                          ? "生成中..."
                          : message.status === "failed"
                            ? "发送失败"
                            : "已完成"
                      }}</span>
                      <small v-if="message.createdAt">{{
                        formatTestTime(message.createdAt)
                      }}</small>
                    </div>
                    <div
                      v-if="message.timeline?.length"
                      class="run-timeline-list"
                    >
                      <div
                        v-for="step in message.timeline"
                        :key="step.id"
                        class="run-timeline-item"
                        :class="step.status"
                      >
                        <span class="timeline-dot"></span>
                        <div>
                          <strong>{{ step.title }}</strong>
                          <small v-if="step.detail">{{ step.detail }}</small>
                        </div>
                      </div>
                    </div>
                    <div
                      v-if="message.toolEvents?.length"
                      class="tool-event-list"
                    >
                      <div
                        v-for="event in message.toolEvents"
                        :key="event.id"
                        class="tool-event-item"
                        :class="event.type"
                      >
                        <span class="tool-event-type">{{
                          toolEventTypeText(event.type)
                        }}</span>
                        <strong v-if="event.toolName">{{
                          event.toolName
                        }}</strong>
                        <span>{{ event.message }}</span>
                      </div>
                    </div>
                    <div class="conversation-content">
                      {{ message.content || "正在生成内容..." }}
                    </div>
                    <div
                      v-if="
                        message.role === 'assistant' &&
                        message.status === 'failed'
                      "
                      class="conversation-actions"
                    >
                      <button
                        type="button"
                        @click="retryAssistantMessage(message.id)"
                      >
                        重新生成
                      </button>
                    </div>
                  </div>
                </div>
                <div class="conversation-composer sticky-composer">
                  <div class="send-config-bar">
                    <label>
                      <span>本次 LLM</span>
                      <select v-model="selectedConversationChannelId">
                        <option
                          v-for="channel in channels"
                          :key="channel.id"
                          :value="channel.id"
                        >
                          {{ channelOptionLabel(channel) }}
                        </option>
                      </select>
                    </label>
                    <label>
                      <span>本次 Agent</span>
                      <select v-model="selectedConversationAgentId">
                        <option value="">不使用 Agent</option>
                        <option
                          v-for="agent in enabledAgents"
                          :key="agent.id"
                          :value="agent.id"
                        >
                          {{ agent.name }}
                        </option>
                      </select>
                    </label>
                  </div>
                  <div
                    class="send-skill-picker compact-skill-picker current-send-skills"
                  >
                    <span class="send-skill-label">本次 Skill：</span>
                    <button
                      v-for="skill in enabledSkills"
                      :key="skill.id"
                      type="button"
                      class="send-skill-chip"
                      :class="{
                        active: selectedConversationSkillIds.includes(skill.id),
                      }"
                      @click="toggleConversationSkill(skill.id)"
                    >
                      {{ skill.name }}
                    </button>
                    <span v-if="!enabledSkills.length" class="send-skill-empty"
                      >暂无可用 Skill</span
                    >
                  </div>
                  <textarea
                    v-model="conversationInput"
                    placeholder="继续当前对话：补充信息、要求修改、追加任务..."
                    @keydown.meta.enter="sendMessage"
                    @keydown.ctrl.enter="sendMessage"
                  />
                  <div class="composer-actions">
                    <button
                      v-if="aiStore.activeRunIds.length"
                      type="button"
                      class="ghost-danger"
                      @click="stopCurrentRuns"
                    >
                      停止
                    </button>
                    <button
                      class="primary-btn"
                      :disabled="
                        !conversationInput.trim() || conversationSending
                      "
                      @click="sendMessage"
                    >
                      {{ conversationSending ? "发送中..." : "发送" }}
                    </button>
                    <span v-if="conversationError" class="conversation-error">{{
                      conversationError
                    }}</span>
                    <span v-else>每次发送前都可以调整 LLM、Skill、Agent</span>
                  </div>
                </div>
              </div>
            </template>
            <div v-else class="empty-conversation-state">
              <div class="section-title">当前对话</div>
              <h2>选择一个历史会话，或新建任务开始</h2>
              <p>左侧是历史会话列表；新建任务会创建一条新的多轮对话。</p>
              <button
                class="primary-btn"
                type="button"
                @click="showNewTaskPanel = true"
              >
                新建任务
              </button>
            </div>
          </article>

          <aside class="conversation-side-panel">
            <section class="card">
              <div class="section-title">会话配置</div>
              <div class="overview-line">
                <span>状态</span><strong>{{ conversationStatusText }}</strong>
              </div>
              <div class="overview-line">
                <span>类型</span
                ><strong>{{
                  selectedTask ? categoryText(selectedTask.category) : "未选择"
                }}</strong>
              </div>
              <label class="side-field">
                <span>当前会话模型</span>
                <select
                  v-model="selectedConversationChannelId"
                  :disabled="!selectedTask"
                >
                  <option
                    v-for="channel in channels"
                    :key="channel.id"
                    :value="channel.id"
                  >
                    {{ channelOptionLabel(channel) }}
                  </option>
                </select>
              </label>
              <div v-if="selectedTask" class="chip-list">
                <span v-for="kind in selectedTask.outputKinds" :key="kind">{{
                  outputKindText(kind)
                }}</span>
              </div>
            </section>

            <section v-if="contextSummaryItems.length" class="card">
              <div class="section-title">上下文</div>
              <div class="context-summary-list">
                <button
                  v-for="item in contextSummaryItems"
                  :key="item.label"
                  type="button"
                  class="context-summary-item"
                  :class="[item.kind, { clickable: item.action }]"
                  @click="item.action?.()"
                >
                  <span>{{ item.label }}</span>
                  <strong>{{ item.value }}</strong>
                </button>
              </div>
            </section>

            <section
              v-if="aiStore.settings.showKnowledgeSnippetPreview"
              class="card"
            >
              <div class="knowledge-preview compact side-preview">
                <div class="knowledge-preview-header">
                  <div>
                    <strong>即将注入的知识片段</strong>
                    <span>{{ knowledgeSnippetPreviewText }}</span>
                  </div>
                  <button
                    v-if="previewKnowledgeSnippets.length"
                    type="button"
                    @click="
                      knowledgePreviewExpanded = !knowledgePreviewExpanded
                    "
                  >
                    {{ knowledgePreviewExpanded ? "收起" : "展开" }}
                  </button>
                </div>
                <div
                  v-if="
                    previewKnowledgeSnippets.length && knowledgePreviewExpanded
                  "
                  class="knowledge-preview-list"
                >
                  <article
                    v-for="snippet in previewKnowledgeSnippets"
                    :key="snippet.path || snippet.title"
                    class="knowledge-preview-item"
                  >
                    <strong>{{ snippet.title }}</strong>
                    <small>{{ snippet.path || "无路径" }}</small>
                    <p>{{ snippet.content }}</p>
                  </article>
                </div>
              </div>
            </section>

            <section v-if="recentTaskRuns.length" class="card task-run-panel">
              <div class="section-title">
                任务运行
                <span class="suggestion-badge">{{
                  recentTaskRuns.length
                }}</span>
              </div>
              <div
                v-for="taskRun in recentTaskRuns"
                :key="taskRun.id"
                class="task-run-card"
              >
                <strong>{{ taskRun.goal }}</strong>
                <small
                  >意图：{{ taskRun.intent }} / 状态：{{
                    taskRun.status
                  }}</small
                >
                <ol class="task-step-list">
                  <li
                    v-for="step in taskRun.steps"
                    :key="step.id"
                    :class="`task-step-${step.status}`"
                  >
                    <span>{{ step.title }}</span>
                    <small>{{ step.status }}</small>
                  </li>
                </ol>
              </div>
            </section>

            <section
              v-if="pendingChangePlans.length"
              class="card permission-request-panel"
            >
              <div class="section-title">
                修改计划
                <span class="suggestion-badge">{{
                  pendingChangePlans.length
                }}</span>
              </div>
              <div
                v-for="plan in pendingChangePlans"
                :key="plan.id"
                class="permission-request-card"
              >
                <strong>{{ plan.id }}</strong>
                <p>文件：{{ plan.files.join(", ") }}</p>
                <small>原因：{{ plan.reasons.join("；") }}</small>
                <small>依据：{{ plan.evidence.join("；") || "未提供" }}</small>
                <small>验证：{{ plan.verification.join("；") }}</small>
                <small v-if="plan.writePreview"
                  >预览工具：{{ plan.writePreview.toolName }} /
                  {{ plan.writePreview.targetPaths.join(", ") }}</small
                >
                <pre v-if="plan.writePreview" class="diff-preview"><span
                  v-for="(line, index) in plan.writePreview.preview.split('\n')"
                  :key="index"
                  :class="{ added: line.startsWith('+') && !line.startsWith('+++'), removed: line.startsWith('-') && !line.startsWith('---') }"
                >{{ line }}\n</span></pre>
                <div class="permission-actions">
                  <button type="button" @click="approveChangePlan(plan.id)">
                    批准计划
                  </button>
                </div>
              </div>
            </section>

            <section
              v-if="pendingPermissionRequests.length"
              class="card permission-request-panel"
            >
              <div class="section-title">
                权限请求
                <span class="suggestion-badge">{{
                  pendingPermissionRequests.length
                }}</span>
              </div>
              <div
                v-for="request in pendingPermissionRequests"
                :key="request.id"
                class="permission-request-card"
              >
                <strong>{{ request.toolName }}</strong>
                <p>{{ request.message }}</p>
                <small v-if="request.reason">{{ request.reason }}</small>
                <pre>{{ request.inputPreview }}</pre>
                <div class="permission-actions">
                  <button
                    type="button"
                    @click="allowPermissionOnce(request.id)"
                  >
                    允许本次
                  </button>
                  <button
                    type="button"
                    class="ghost-danger"
                    @click="denyPermissionOnce(request.id)"
                  >
                    拒绝
                  </button>
                </div>
              </div>
            </section>

            <section class="card">
              <div class="section-title">工具审计</div>
              <div v-if="recentToolAuditLogs.length" class="audit-log-list">
                <div
                  v-for="log in recentToolAuditLogs"
                  :key="log.id"
                  class="audit-log-item"
                  :class="log.behavior"
                >
                  <strong>{{ log.toolName }}</strong>
                  <span
                    >{{ log.behavior }} · {{ log.resourceKind }} ·
                    {{ log.resource }}</span
                  >
                  <small>{{ log.reason || "无说明" }}</small>
                </div>
              </div>
              <p v-else class="muted">暂无工具调用记录。</p>
            </section>

            <section v-if="selectedTask" class="card">
              <div class="section-title">沉淀操作</div>
              <div class="output-actions vertical-actions">
                <button @click="addSuggestion('document')">
                  保存文档到本地
                </button>
                <button
                  :disabled="!knowledgeGraphStore.vaultPath"
                  @click="addSuggestion('document', true)"
                >
                  保存到当前知识库
                </button>
                <button @click="addSuggestion('todo')">提取待办</button>
                <button @click="addSuggestion('schedule')">提取日程</button>
                <button @click="addSuggestion('knowledge')">
                  建议加入知识库
                </button>
              </div>
            </section>

            <section
              v-if="selectedTaskSuggestions.length"
              class="card auto-suggestion-panel"
            >
              <div class="section-title">
                沉淀建议
                <span class="suggestion-badge"
                  >{{ selectedTaskSuggestions.length }} 条</span
                >
              </div>
              <div
                v-for="item in selectedTaskSuggestions"
                :key="item.id"
                class="suggestion-card"
                :class="item.type"
              >
                <div class="suggestion-header">
                  <span class="suggestion-type-tag">{{
                    artifactTypeText(item.type)
                  }}</span>
                  <strong>{{ item.title }}</strong>
                </div>
                <p class="suggestion-summary">{{ item.summary }}</p>
                <p v-if="item.filePath" class="suggestion-summary">
                  文件路径：{{ item.filePath }}
                </p>
                <div class="suggestion-actions">
                  <button
                    class="primary-btn suggestion-adopt"
                    @click="adoptSuggestion(item.type)"
                  >
                    {{
                      item.type === "todo"
                        ? "直接提取待办"
                        : item.type === "schedule"
                          ? "直接添加日程"
                          : item.type === "document"
                            ? "保存文档到本地"
                            : "直接沉淀知识"
                    }}
                  </button>
                  <button
                    class="suggestion-dismiss"
                    @click="aiStore.removeArtifact(item.id)"
                  >
                    忽略
                  </button>
                </div>
              </div>
            </section>
          </aside>
        </section>

        <section v-else-if="activeTab === 'tasks'" class="panel-section">
          <div class="table-card">
            <div class="table-row table-head">
              <span>任务</span><span>状态</span><span>类型</span
              ><span>可能产出</span><span>操作</span>
            </div>
            <div v-for="task in sortedTasks" :key="task.id" class="table-row">
              <button
                class="table-title"
                @click="
                  selectedTaskId = task.id;
                  activeTab = 'chat';
                "
              >
                {{ task.title }}
              </button>
              <span class="status" :class="task.status">{{
                statusText(task.status)
              }}</span>
              <span>{{ categoryText(task.category) }}</span>
              <span>{{
                task.outputKinds.map(outputKindText).join("、") || "直接回答"
              }}</span>
              <button class="danger" @click="aiStore.deleteTask(task.id)">
                删除
              </button>
            </div>
          </div>
        </section>

        <section v-else-if="activeTab === 'skills'" class="panel-section">
          <div class="manager-head">
            <div>
              <h2>Skill 管理</h2>
              <p>
                Skill 是万能 AI
                可调用的能力模板，是否产生文档、日程或知识沉淀由任务判断。
              </p>
            </div>
            <form class="add-form" @submit.prevent="addSkill">
              <input v-model="newSkillName" placeholder="新 Skill 名称" />
              <button :disabled="!newSkillName.trim()">新增</button>
            </form>
          </div>

          <div class="settings-block" style="margin-top: 12px">
            <div class="section-title">从 GitHub 安装 Skill</div>
            <div class="settings-grid">
              <div>
                <span>GitHub 插件地址</span>
                <input
                  v-model="skillGithubUrl"
                  placeholder="支持仓库、blob、tree 或 raw 地址"
                />
              </div>
            </div>
            <div class="composer-actions">
              <button
                class="primary-btn"
                :disabled="!skillGithubUrl.trim() || skillGithubInstalling"
                @click="installSkillFromGithub"
              >
                {{ skillGithubInstalling ? "安装中..." : "安装 Skill 插件" }}
              </button>
              <span
                v-if="skillGithubMessage"
                :class="
                  skillGithubMessage.includes('失败')
                    ? 'conversation-error'
                    : ''
                "
                >{{ skillGithubMessage }}</span
              >
            </div>
          </div>

          <div class="settings-block" style="margin-top: 12px">
            <div class="section-title">从 SkillHub 安装 Skill</div>
            <div class="settings-grid">
              <div>
                <span>SkillHub 地址</span>
                <input
                  v-model="skillSkillHubUrl"
                  placeholder="支持 https 地址或 skillhub:// 地址"
                />
              </div>
            </div>
            <div class="composer-actions">
              <button
                class="primary-btn"
                :disabled="!skillSkillHubUrl.trim() || skillSkillHubInstalling"
                @click="installSkillFromSkillHub"
              >
                {{ skillSkillHubInstalling ? "安装中..." : "安装 Skill 插件" }}
              </button>
              <span
                v-if="skillSkillHubMessage"
                :class="
                  skillSkillHubMessage.includes('失败')
                    ? 'conversation-error'
                    : ''
                "
                >{{ skillSkillHubMessage }}</span
              >
            </div>
          </div>
          <div class="cards-grid">
            <article
              v-for="skill in aiStore.skills"
              :key="skill.id"
              class="manage-card"
            >
              <div class="item-heading">
                <h3>{{ skill.name }}</h3>
                <label
                  ><input
                    type="checkbox"
                    :checked="skill.enabled"
                    @change="onSkillToggle(skill.id, $event)"
                  />
                  启用</label
                >
              </div>
              <p>{{ skill.description }}</p>
              <small>{{ skill.whenToUse }}</small>
              <div class="chip-list">
                <span>{{ categoryText(skill.category) }}</span>
                <span v-if="skill.outputPolicy.mayCreateDocument">文档</span>
                <span v-if="skill.outputPolicy.mayCreateTodo">待办</span>
                <span v-if="skill.outputPolicy.mayCreateSchedule">日程</span>
                <span v-if="skill.outputPolicy.mayUpdateKnowledgeBase"
                  >知识</span
                >
              </div>
            </article>
          </div>
        </section>

        <section v-else-if="activeTab === 'agents'" class="panel-section">
          <div class="manager-head">
            <div>
              <h2>Agent 管理</h2>
              <p>Agent 是后台专业执行者；普通用户默认只面对万能 AI。</p>
            </div>
            <form class="add-form" @submit.prevent="addAgent">
              <input v-model="newAgentName" placeholder="新 Agent 名称" />
              <button :disabled="!newAgentName.trim()">新增</button>
            </form>
          </div>

          <div class="settings-block" style="margin-top: 12px">
            <div class="section-title">从 GitHub 安装 Agent</div>
            <div class="settings-grid">
              <div>
                <span>GitHub 插件地址</span>
                <input
                  v-model="agentGithubUrl"
                  placeholder="支持仓库、blob、tree 或 raw 地址"
                />
              </div>
            </div>
            <div class="composer-actions">
              <button
                class="primary-btn"
                :disabled="!agentGithubUrl.trim() || agentGithubInstalling"
                @click="installAgentFromGithub"
              >
                {{ agentGithubInstalling ? "安装中..." : "安装 Agent 插件" }}
              </button>
              <span
                v-if="agentGithubMessage"
                :class="
                  agentGithubMessage.includes('失败')
                    ? 'conversation-error'
                    : ''
                "
                >{{ agentGithubMessage }}</span
              >
            </div>
          </div>

          <div class="settings-block" style="margin-top: 12px">
            <div class="section-title">从 SkillHub 安装 Agent</div>
            <div class="settings-grid">
              <div>
                <span>SkillHub 地址</span>
                <input
                  v-model="agentSkillHubUrl"
                  placeholder="支持 https 地址或 skillhub:// 地址"
                />
              </div>
            </div>
            <div class="composer-actions">
              <button
                class="primary-btn"
                :disabled="!agentSkillHubUrl.trim() || agentSkillHubInstalling"
                @click="installAgentFromSkillHub"
              >
                {{ agentSkillHubInstalling ? "安装中..." : "安装 Agent 插件" }}
              </button>
              <span
                v-if="agentSkillHubMessage"
                :class="
                  agentSkillHubMessage.includes('失败')
                    ? 'conversation-error'
                    : ''
                "
                >{{ agentSkillHubMessage }}</span
              >
            </div>
          </div>
          <div class="cards-grid">
            <article
              v-for="agent in aiStore.agents"
              :key="agent.id"
              class="manage-card"
            >
              <div class="item-heading">
                <h3>{{ agent.name }}</h3>
                <label
                  ><input
                    type="checkbox"
                    :checked="agent.enabled"
                    @change="onAgentToggle(agent.id, $event)"
                  />
                  启用</label
                >
              </div>
              <p>{{ agent.description }}</p>
              <small>{{ agent.whenToUse }}</small>
              <div class="chip-list">
                <span>{{ agent.permissionMode }}</span>
                <span>{{ agent.runMode }}</span>
                <span>调用 {{ agent.usageCount }} 次</span>
              </div>
            </article>
          </div>
        </section>

        <section v-else class="panel-section">
          <div class="settings-grid">
            <div class="settings-block">
              <div class="section-title">当前使用渠道</div>
              <div class="settings-grid">
                <div>
                  <span>当前渠道</span>
                  <select
                    :value="aiStore.settings.activeChannelId"
                    @change="onActiveChannelChange"
                  >
                    <option
                      v-for="channel in channels"
                      :key="channel.id"
                      :value="channel.id"
                    >
                      {{ channel.name }}（{{ channel.provider }} /
                      {{ channel.model || "未填写模型" }}）
                    </option>
                  </select>
                </div>
                <div>
                  <span>当前 API Key 状态</span>
                  <div class="inline-note">
                    <strong>{{
                      activeChannel?.apiKeyStored ? "已加密保存" : "未设置"
                    }}</strong>
                    <span>不同渠道可独立配置 API Key。</span>
                  </div>
                </div>
                <div>
                  <span>当前渠道测试</span>
                  <div class="inline-note">
                    <div class="key-actions">
                      <button
                        type="button"
                        :disabled="
                          !activeChannel ||
                          getChannelTestResult(activeChannel?.id ?? '')
                            .status === 'checking'
                        "
                        @click="activeChannel && testChannel(activeChannel.id)"
                      >
                        {{
                          activeChannel &&
                          getChannelTestResult(activeChannel.id).status ===
                            "checking"
                            ? "正在测试..."
                            : "测试当前渠道"
                        }}
                      </button>
                    </div>
                    <div
                      class="test-result"
                      :class="
                        activeChannel
                          ? getChannelTestResult(activeChannel.id).status
                          : 'idle'
                      "
                    >
                      <strong>{{
                        activeChannel
                          ? channelTestTitle(activeChannel.id)
                          : "未测试"
                      }}</strong>
                      <span>{{
                        activeChannel
                          ? getChannelTestResult(activeChannel.id).message
                          : "请先配置渠道。"
                      }}</span>
                      <small
                        v-if="activeChannel && testAdvice(activeChannel.id)"
                        >{{ testAdvice(activeChannel.id) }}</small
                      >
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="settings-block">
              <div class="section-title">LLM 渠道管理</div>
              <div class="table-card">
                <div class="table-row table-head">
                  <span>渠道</span><span>模型</span><span>API Key</span
                  ><span>操作</span>
                </div>
                <div
                  v-for="channel in channels"
                  :key="channel.id"
                  class="table-row"
                >
                  <div>
                    <button class="table-title" @click="editChannel(channel)">
                      {{ channel.name }}
                    </button>
                    <small
                      ><span class="provider-tag">{{
                        providerLabel(channel.provider)
                      }}</span>
                      · {{ channel.enabled ? "启用" : "禁用" }}</small
                    >
                  </div>
                  <span
                    >{{ channel.model || "-" }}<br /><small>{{
                      channel.baseUrl || "默认 Base URL"
                    }}</small></span
                  >
                  <span>
                    <span
                      class="status"
                      :class="getChannelTestResult(channel.id).status"
                      >{{ channelTestTitle(channel.id) }}</span
                    >
                    <br />
                    <small>{{
                      channel.apiKeyStored
                        ? "API Key 已加密保存"
                        : "API Key 未设置"
                    }}</small>
                    <br v-if="getChannelTestResult(channel.id).testedAt" />
                    <small v-if="getChannelTestResult(channel.id).testedAt">{{
                      formatTestTime(getChannelTestResult(channel.id).testedAt)
                    }}</small>
                  </span>
                  <div class="row-actions">
                    <button @click="aiStore.setActiveChannel(channel.id)">
                      设为默认
                    </button>
                    <button @click="testChannel(channel.id)">测试</button>
                    <button
                      class="danger"
                      @click="aiStore.deleteChannel(channel.id)"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>

              <div class="settings-grid">
                <div>
                  <span>渠道名称</span>
                  <input
                    v-model="channelForm.name"
                    placeholder="例如 OpenAI 官方 / 公司代理 / OpenRouter"
                  />
                </div>
                <div>
                  <span>模型提供商</span>
                  <select v-model="channelForm.provider">
                    <option
                      v-for="option in providerOptions"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                  <div
                    v-if="channelForm.provider === 'custom'"
                    class="key-actions"
                    style="margin-top: 6px"
                  >
                    <input
                      v-model="customProviderName"
                      required
                      placeholder="请输入自定义提供商名称"
                    />
                  </div>
                </div>
                <div>
                  <span>模型名称</span>
                  <input
                    v-model="channelForm.model"
                    placeholder="例如 gpt-4o / claude-sonnet-4-20250514 / gemini-1.5-pro"
                  />
                </div>
                <div>
                  <span>Base URL（可选）</span>
                  <input
                    v-model="channelForm.baseUrl"
                    :placeholder="channelBaseUrlPlaceholder"
                  />
                  <small>{{ channelBaseUrlHint }}</small>
                </div>
                <div>
                  <span>API Key</span>
                  <div class="inline-note">
                    <div class="status-row">
                      <span
                        class="status-dot"
                        :class="channelForm.apiKeyStored ? 'success' : 'warn'"
                      ></span>
                      <strong>{{
                        channelForm.apiKeyStored
                          ? "API Key 已加密保存（不可查看）"
                          : "API Key 未设置"
                      }}</strong>
                    </div>
                    <div class="key-actions">
                      <input
                        v-model="channelSecretInput"
                        type="password"
                        placeholder="保存渠道时将一并加密保存"
                      />
                    </div>
                    <span>保存渠道后，API Key 会以加密方式存储。</span>
                  </div>
                </div>
                <div>
                  <span>启用状态</span>
                  <label
                    ><input type="checkbox" v-model="channelForm.enabled" />
                    该渠道可用于选择</label
                  >
                </div>
                <div class="key-actions">
                  <button @click="openNewChannelForm()">新增渠道</button>
                  <button class="primary-btn" @click="saveChannelForm()">
                    {{ channelForm.id ? "更新渠道" : "添加渠道" }}
                  </button>
                  <button
                    type="button"
                    :disabled="
                      !channelForm.id ||
                      getChannelTestResult(channelForm.id).status === 'checking'
                    "
                    @click="testCurrentFormChannel()"
                  >
                    {{
                      getChannelTestResult(channelForm.id).status === "checking"
                        ? "正在测试..."
                        : "测试当前渠道"
                    }}
                  </button>
                </div>

                <div
                  v-if="channelForm.id"
                  class="test-result"
                  :class="getChannelTestResult(channelForm.id).status"
                >
                  <strong>{{ channelTestTitle(channelForm.id) }}</strong>
                  <span>{{
                    getChannelTestResult(channelForm.id).message
                  }}</span>
                  <small v-if="testAdvice(channelForm.id)">{{
                    testAdvice(channelForm.id)
                  }}</small>
                  <small v-if="getChannelTestResult(channelForm.id).testedAt"
                    >测试时间：{{
                      formatTestTime(
                        getChannelTestResult(channelForm.id).testedAt,
                      )
                    }}</small
                  >
                  <div
                    v-if="
                      getChannelTestResult(channelForm.id).status !== 'idle'
                    "
                    class="key-actions"
                    style="margin-top: 6px"
                  >
                    <button
                      type="button"
                      :disabled="
                        getChannelTestResult(channelForm.id).status ===
                        'checking'
                      "
                      @click="testCurrentFormChannel()"
                    >
                      重新测试
                    </button>
                  </div>

                  <div
                    v-if="aiStore.channelHistory(channelForm.id).length"
                    style="margin-top: 8px"
                  >
                    <div class="section-title" style="margin-bottom: 4px">
                      最近测试记录
                    </div>
                    <div
                      v-for="(item, index) in aiStore.channelHistory(
                        channelForm.id,
                      )"
                      :key="index"
                      class="overview-line"
                    >
                      <span>{{ formatTestTime(item.testedAt) || "-" }}</span>
                      <strong>{{
                        item.status === "success" ? "成功" : "失败"
                      }}</strong>
                      <span>{{ item.message }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="settings-block">
              <div class="section-title">任务策略</div>
              <div class="settings-grid">
                <label
                  ><input
                    v-model="settings.requireConfirmBeforeWrite"
                    type="checkbox"
                    @change="updateSettingsFromUI"
                  />
                  写入前必须确认</label
                >
                <label
                  ><input
                    v-model="settings.suggestDocuments"
                    type="checkbox"
                    @change="updateSettingsFromUI"
                  />
                  识别到正式内容时建议保存文档</label
                >
                <label
                  ><input
                    v-model="settings.suggestTodos"
                    type="checkbox"
                    @change="updateSettingsFromUI"
                  />
                  识别行动项时建议生成待办</label
                >
                <label
                  ><input
                    v-model="settings.suggestSchedules"
                    type="checkbox"
                    @change="updateSettingsFromUI"
                  />
                  识别时间信息时建议加入日程</label
                >
                <label
                  ><input
                    v-model="settings.suggestKnowledge"
                    type="checkbox"
                    @change="updateSettingsFromUI"
                  />
                  识别长期价值时建议加入知识库</label
                >
                <div>
                  <span>默认输出目录</span>
                  <input
                    v-model="settings.defaultOutputDirectory"
                    @change="updateSettingsFromUI"
                  />
                </div>
                <div>
                  <span>AI 文档默认保存路径</span>
                  <div class="key-actions">
                    <input
                      v-model="settings.aiDocumentSavePath"
                      placeholder="留空使用 ~/Documents/workgaga/AI-文档"
                      @change="updateSettingsFromUI"
                    />
                    <button type="button" @click="chooseAIDocumentSavePath">
                      选择目录
                    </button>
                  </div>
                  <small
                    >留空时保留默认路径
                    fallback；保存到当前知识库失败时也会回退到这里。</small
                  >
                </div>
                <div>
                  <span>知识库内 AI 文档保存子目录</span>
                  <input
                    v-model="settings.aiDocumentVaultSubdir"
                    placeholder="例如 AI-文档 或 Inbox/AI"
                    @change="updateSettingsFromUI"
                  />
                  <small
                    >保存到当前知识库时写入该子目录；留空则保持写入知识库根目录的
                    fallback 行为。</small
                  >
                </div>
                <label
                  ><input
                    v-model="settings.saveDocumentsToCurrentVault"
                    type="checkbox"
                    @change="updateSettingsFromUI"
                  />
                  默认优先保存 AI 文档到当前知识库</label
                >
                <label
                  ><input
                    v-model="settings.enableKnowledgeSnippetInjection"
                    type="checkbox"
                    @change="updateSettingsFromUI"
                  />
                  发送时启用知识片段注入</label
                >
                <div>
                  <span>最大注入片段数</span>
                  <input
                    v-model.number="settings.maxKnowledgeSnippets"
                    type="number"
                    min="0"
                    max="20"
                    @change="updateSettingsFromUI"
                  />
                </div>
                <label
                  ><input
                    v-model="settings.showKnowledgeSnippetPreview"
                    type="checkbox"
                    @change="updateSettingsFromUI"
                  />
                  显示知识片段预览</label
                >
                <label
                  ><input
                    v-model="settings.autoExpandKnowledgeSnippetPreview"
                    type="checkbox"
                    @change="updateSettingsFromUI"
                  />
                  自动展开知识片段预览</label
                >
              </div>
            </div>
          </div>
        </section>

        <section v-if="activeTab === 'installed'" class="panel-section">
          <div class="manager-head">
            <div>
              <h2>已安装插件</h2>
              <p>管理从 GitHub 或 SkillHub 安装的 Skill/Agent 插件。</p>
            </div>
            <div class="add-form">
              <button type="button" @click="refreshLocalPlugins">
                刷新本地插件
              </button>
            </div>
          </div>

          <div class="settings-block" style="margin-top: 12px">
            <div class="section-title">已安装 Skill 插件</div>
            <div v-if="!installedSkillList.length" class="overview-line">
              <span>暂无已安装 Skill 插件</span>
            </div>
            <div
              v-for="item in installedSkillList"
              :key="item.id"
              class="overview-line"
            >
              <span
                >{{ item.name }}<br /><small
                  >{{ item.version }} · {{ item.sourceType
                  }}{{ item.sourceUrl ? " · " + item.sourceUrl : "" }}</small
                ></span
              >
              <strong>Skill</strong>
              <button class="danger" @click="uninstallInstalledPlugin(item.id)">
                卸载
              </button>
            </div>
          </div>

          <div class="settings-block" style="margin-top: 12px">
            <div class="section-title">已安装 Agent 插件</div>
            <div v-if="!installedAgentList.length" class="overview-line">
              <span>暂无已安装 Agent 插件</span>
            </div>
            <div
              v-for="item in installedAgentList"
              :key="item.id"
              class="overview-line"
            >
              <span
                >{{ item.name }}<br /><small
                  >{{ item.version }} · {{ item.sourceType
                  }}{{ item.sourceUrl ? " · " + item.sourceUrl : "" }}</small
                ></span
              >
              <strong>Agent</strong>
              <button class="danger" @click="uninstallInstalledPlugin(item.id)">
                卸载
              </button>
            </div>
          </div>
        </section>
      </section>

      <aside class="right-rail">
        <section class="card">
          <div class="section-title">任务概览</div>
          <div class="overview-line">
            <span>待处理</span><strong>{{ taskCounts.pending }}</strong>
          </div>
          <div class="overview-line">
            <span>进行中</span><strong>{{ taskCounts.running }}</strong>
          </div>
          <div class="overview-line">
            <span>已完成</span><strong>{{ taskCounts.completed }}</strong>
          </div>
          <div class="overview-line">
            <span>失败</span><strong>{{ taskCounts.failed }}</strong>
          </div>
        </section>

        <section class="card">
          <div class="section-title">进行中 / 待处理</div>
          <ul class="side-list">
            <li v-for="task in activeTasks" :key="task.id">
              <button
                @click="
                  selectedTaskId = task.id;
                  activeTab = 'chat';
                "
              >
                <strong>{{ task.title }}</strong>
                <span>{{ statusText(task.status) }}</span>
              </button>
            </li>
            <li v-if="activeTasks.length === 0" class="empty">暂无任务</li>
          </ul>
        </section>

        <section class="card">
          <div class="section-title">待确认动作</div>
          <ul class="confirm-list">
            <li>写入文档前确认</li>
            <li>创建待办前确认</li>
            <li>加入日程前确认</li>
            <li>知识沉淀前确认</li>
          </ul>
        </section>

        <section class="card">
          <div class="section-title">当前渠道</div>
          <div class="overview-line">
            <span>渠道</span
            ><strong>{{ activeChannel?.name ?? "未设置" }}</strong>
          </div>
          <div class="overview-line">
            <span>提供商</span
            ><strong>{{ activeChannel?.provider ?? "-" }}</strong>
          </div>
          <div class="overview-line">
            <span>模型</span><strong>{{ activeChannel?.model ?? "-" }}</strong>
          </div>
          <div class="overview-line">
            <span>API Key</span
            ><strong>{{
              activeChannel?.apiKeyStored ? "已加密保存" : "未设置"
            }}</strong>
          </div>
          <div class="overview-line">
            <span>测试</span
            ><strong>{{
              activeChannel
                ? getChannelTestResult(activeChannel.id).message
                : "请先配置渠道。"
            }}</strong>
          </div>
        </section>

        <section class="card">
          <div class="section-title">最近产出</div>
          <p class="muted">后续接入保存为文档、提取待办和日程后在这里展示。</p>
        </section>
      </aside>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { open } from "@tauri-apps/plugin-dialog";
import {
  useAIAssistantStore,
  useDashboardStore,
  useFileStore,
  useKnowledgeGraphStore,
} from "../store";
import type {
  AIAgent,
  AIArtifactType,
  AICategory,
  AIChannelTestResult,
  AIContextSnapshot,
  AIMessageToolEvent,
  AIModelProvider,
  AIOutputKind,
  AISkill,
  AITaskStatus,
  LLModelChannel,
} from "../store/modal/aiAssistant";
import { listAIToolAuditLogs } from "../utils/aiRuntime";
import { notifySuccess, notifyWarning } from "../utils/notifications";
import { retrieveAIKnowledgeSnippets } from "../utils/aiKnowledgeRetrieval";
import { getRelativePath } from "../utils/knowledgeGraph";
import { WINDOW_EVENTS } from "../constants/events";

const aiStore = useAIAssistantStore();
const dashboardStore = useDashboardStore();
const fileStore = useFileStore();
const knowledgeGraphStore = useKnowledgeGraphStore();

const tabs = [
  { id: "chat", label: "对话" },
  { id: "tasks", label: "任务" },
  { id: "skills", label: "Skill" },
  { id: "agents", label: "Agent" },
  { id: "settings", label: "设置" },
  { id: "installed", label: "已安装" },
] as const;

type TabId = (typeof tabs)[number]["id"];

const activeTab = ref<TabId>("chat");
const userInput = ref("");
const selectedTaskId = ref<string | null>(null);
const showNewTaskPanel = ref(false);
const newSkillName = ref("");
const newAgentName = ref("");
const settings = reactive({
  ...aiStore.settings,
});

const providerOptions: { value: AIModelProvider; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "vercelai_gateway", label: "Vercel AI Gateway" },
  { value: "custom", label: "自定义" },
];

const customProviderName = ref("");

const presetProviderValues = new Set(
  providerOptions
    .filter((option) => option.value !== "custom")
    .map((option) => option.value),
);

const providerLabel = (provider: string): string => {
  if (presetProviderValues.has(provider as AIModelProvider)) {
    return (
      providerOptions.find((option) => option.value === provider)?.label ??
      provider
    );
  }

  return provider === "custom" ? "自定义" : `自定义: ${provider}`;
};

const getProviderBaseUrlExample = (provider: AIModelProvider): string => {
  switch (provider) {
    case "anthropic":
      return "例如 https://api.anthropic.com 或 https://your-proxy.com/v1";
    case "gemini":
      return "例如 https://generativelanguage.googleapis.com 或代理的 /v1beta 地址";
    case "openrouter":
      return "例如 https://openrouter.ai/api 或你的 OpenAI 兼容代理地址";
    case "vercelai_gateway":
      return "例如 https://api.vercel.ai 或你的网关代理地址";
    case "custom":
      return "例如 https://your-domain.com、https://your-domain.com/v1 或完整接口地址";
    case "openai":
    default:
      return "例如 https://api.openai.com、https://your-proxy.com/v1 或完整接口地址";
  }
};

const getProviderBaseUrlHint = (provider: AIModelProvider): string => {
  switch (provider) {
    case "anthropic":
      return "支持填写根域名、`/v1` 或完整 `/messages` 地址；系统会自动规范化，避免重复拼接。";
    case "gemini":
      return "支持填写根域名、`/v1beta`、`/models/...` 或完整 `:generateContent` 地址；系统会自动补齐 `key` 参数。";
    default:
      return "支持填写根域名、`/v1` 或完整 `/chat/completions` 地址；测试和真实调用都会自动规范化，不会重复追加 `/v1`。";
  }
};

const channelBaseUrlPlaceholder = computed(() =>
  getProviderBaseUrlExample(channelForm.provider),
);
const channelBaseUrlHint = computed(() =>
  getProviderBaseUrlHint(channelForm.provider),
);

const formatTestTime = (value: number): string => {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch (error) {
    return "";
  }
};

const testAdvice = (channelId: string): string => {
  const result = getChannelTestResult(channelId);
  if (result.status !== "error") return "";

  const { message } = result;
  if (message.includes("认证失败")) {
    return "建议检查当前渠道 API Key 是否正确、是否过期，以及是否有对应模型的访问权限。";
  }

  if (message.includes("未配置 API Key")) {
    return "建议先在当前渠道中保存 API Key，或确认环境变量配置已生效。";
  }

  if (message.includes("未填写模型名称")) {
    return "建议先填写模型名称，再执行测试。";
  }

  if (message.includes("异常状态码")) {
    return "建议核对模型名称、Base URL、渠道类型是否匹配，并确认该服务端支持当前请求格式。";
  }

  if (message.includes("无法连接")) {
    return "建议检查网络连通性、代理设置、Base URL 是否可达，以及是否存在 CSP/跨域限制。";
  }

  return "建议检查 Base URL、网络连通性、模型名称与 API Key 是否匹配。";
};

const channelForm = reactive<LLModelChannel>(createDefaultChannelForm());
const channelSecretInput = ref("");
const channels = computed(() => aiStore.settings.llmChannels);
const activeChannel = computed(() => aiStore.activeChannel);
const selectedDirectChannelId = ref("");
const selectedConversationChannelId = ref("");
const selectedConversationAgentId = ref("");
const selectedConversationSkillIds = ref<string[]>([]);
const auditRefreshKey = ref(0);

const pendingPermissionRequests = computed(() =>
  aiStore.pendingPermissionRequests.filter((request) => !request.resolvedAt),
);
const pendingChangePlans = computed(() =>
  aiStore.changePlans.filter((plan) => !plan.approved),
);
const recentTaskRuns = computed(() => aiStore.taskRuns.slice(0, 3));

const recentToolAuditLogs = computed(() => {
  auditRefreshKey.value;
  return listAIToolAuditLogs().slice(0, 8);
});

const approveChangePlan = (id: string): void => {
  aiStore.approveChangePlan(id);
};

const allowPermissionOnce = (id: string): void => {
  aiStore.resolvePermissionRequest(id, "allow-once");
};

const denyPermissionOnce = (id: string): void => {
  aiStore.resolvePermissionRequest(id, "deny-once");
};

const stopCurrentRuns = (): void => {
  aiStore.cancelAllRuns();
  conversationSending.value = false;
};

const toolEventTypeText = (type: AIMessageToolEvent["type"]): string =>
  ({
    start: "开始",
    progress: "进度",
    result: "完成",
    error: "失败",
  })[type];

const channelOptionLabel = (channel: LLModelChannel): string => {
  const provider = providerLabel(channel.provider);
  const model = channel.model || "未填写模型";
  return `${channel.name}（${provider} / ${model}${channel.enabled ? "" : " / 已禁用"}）`;
};

const getChannelTestResult = (channelId: string): AIChannelTestResult =>
  aiStore.channelTestResults[channelId] || {
    status: "idle",
    message: "尚未测试该渠道。",
    testedAt: 0,
  };

const channelTestTitle = (channelId: string): string =>
  ({
    idle: "未测试",
    checking: "检测中",
    success: "校验通过",
    error: "校验未通过",
  })[getChannelTestResult(channelId).status];

const openNewChannelForm = (): void => {
  Object.assign(channelForm, createDefaultChannelForm());
  channelSecretInput.value = "";
};

const editChannel = (channel: LLModelChannel): void => {
  const isPreset = providerOptions.some(
    (option) => option.value === channel.provider,
  );

  Object.assign(channelForm, {
    ...channel,
    provider: isPreset ? channel.provider : "custom",
  });

  customProviderName.value = isPreset ? "" : channel.provider;
  channelSecretInput.value = "";
};

const saveChannelForm = async (): Promise<string | null> => {
  const trimmedName = channelForm.name.trim();
  const trimmedModel = channelForm.model.trim();
  if (!trimmedName || !trimmedModel) return channelForm.id || null;

  if (channelForm.provider === "custom" && !customProviderName.value.trim()) {
    return channelForm.id || null;
  }

  const resolvedProvider =
    channelForm.provider === "custom"
      ? customProviderName.value.trim() || "custom"
      : channelForm.provider;

  if (channelForm.id) {
    aiStore.updateChannel(channelForm.id, {
      name: trimmedName,
      provider: resolvedProvider as AIModelProvider,
      model: trimmedModel,
      baseUrl: channelForm.baseUrl.trim(),
      enabled: channelForm.enabled,
    });
  } else {
    const created = aiStore.addChannel({
      name: trimmedName,
      provider: resolvedProvider as AIModelProvider,
      model: trimmedModel,
      baseUrl: channelForm.baseUrl.trim(),
      enabled: channelForm.enabled,
    });

    if (created) {
      channelForm.id = created.id;
    }
  }

  if (channelForm.id && channelSecretInput.value.trim()) {
    await aiStore.setChannelApiKey(
      channelForm.id,
      channelSecretInput.value.trim(),
    );
  }

  channelSecretInput.value = "";
  return channelForm.id || null;
};

const testChannel = async (channelId: string): Promise<void> => {
  await aiStore.testChannelConnection(channelId);
};

const testCurrentFormChannel = async (): Promise<void> => {
  if (!channelForm.id) return;
  await testChannel(channelForm.id);
};

const onActiveChannelChange = (event: Event): void => {
  const { target } = event;
  if (!(target instanceof HTMLSelectElement)) return;
  aiStore.setActiveChannel(target.value);
};

function createDefaultChannelForm(): LLModelChannel {
  return {
    id: "",
    name: "新渠道",
    provider: "openai",
    model: "",
    baseUrl: "",
    enabled: true,
    apiKeyStored: false,
    apiKeyStoredAt: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

const quickActions = [
  "规划事项",
  "生成文档",
  "提取行动项",
  "整理产出",
  "研究分析",
];
const enabledSkills = computed(() => aiStore.enabledSkills);
const enabledAgents = computed(() => aiStore.enabledAgents);
const sortedTasks = computed(() => aiStore.sortedTasks);
const taskCounts = computed(() => aiStore.taskCounts);
const selectedTask = computed(
  () => aiStore.tasks.find((task) => task.id === selectedTaskId.value) || null,
);
const currentFileName = computed(
  () => fileStore.currentFilePath?.split(/[\\/]/).pop() || "未打开",
);
const activeTasks = computed(() =>
  sortedTasks.value
    .filter((task) => task.status === "pending" || task.status === "running")
    .slice(0, 6),
);
const conversationInput = ref("");
const conversationSending = ref(false);
const conversationError = ref("");

const selectedSendSkillIds = ref<string[]>([]);
const sendingDirectly = ref(false);
const directSendError = ref("");
const knowledgePreviewExpanded = ref(
  aiStore.settings.autoExpandKnowledgeSnippetPreview,
);

watch(
  () => aiStore.settings.autoExpandKnowledgeSnippetPreview,
  (enabled) => {
    knowledgePreviewExpanded.value = enabled;
  },
);

const toggleSkillSelection = (
  selection: typeof selectedSendSkillIds,
  skillId: string,
): void => {
  const index = selection.value.indexOf(skillId);
  if (index >= 0) {
    selection.value = selection.value.filter((id) => id !== skillId);
  } else {
    selection.value = [...selection.value, skillId];
  }
};

const toggleSendSkill = (skillId: string): void =>
  toggleSkillSelection(selectedSendSkillIds, skillId);
const toggleConversationSkill = (skillId: string): void =>
  toggleSkillSelection(selectedConversationSkillIds, skillId);

const retrieveKnowledgeSnippets = (input: string) => {
  if (!aiStore.settings.enableKnowledgeSnippetInjection) return [];
  return retrieveAIKnowledgeSnippets(
    input,
    knowledgeGraphStore.graphData?.notes ?? [],
    {
      currentFilePath: fileStore.currentFilePath,
      recentFilePaths: fileStore.sortedRecentFiles.map((file) => file.path),
      maxSnippets: aiStore.settings.maxKnowledgeSnippets,
      graphData: knowledgeGraphStore.graphData,
      includeGraphNeighbors: true,
      graphNeighborBoost: 2,
    },
  );
};

const buildContextSnapshot = (input = ""): AIContextSnapshot => ({
  currentFileName: fileStore.currentFilePath?.split(/[\\/]/).pop() || undefined,
  vaultName: knowledgeGraphStore.vaultName || undefined,
  vaultPath: knowledgeGraphStore.vaultPath || undefined,
  noteCount: knowledgeGraphStore.noteCount || undefined,
  knowledgeSnippets:
    input.trim() && aiStore.settings.enableKnowledgeSnippetInjection
      ? retrieveKnowledgeSnippets(input)
      : [],
});

const selectTask = (taskId: string): void => {
  selectedTaskId.value = taskId;
  conversationError.value = "";
  directSendError.value = "";
  showNewTaskPanel.value = false;
};

watch(
  sortedTasks,
  (tasks) => {
    if (
      selectedTaskId.value &&
      tasks.some((task) => task.id === selectedTaskId.value)
    )
      return;
    selectedTaskId.value = tasks[0]?.id ?? null;
    showNewTaskPanel.value = tasks.length === 0;
  },
  { immediate: true },
);

const sendDirectPrompt = async (): Promise<void> => {
  const trimmed = userInput.value.trim();
  if (!trimmed) return;

  sendingDirectly.value = true;
  directSendError.value = "";
  try {
    const task = await aiStore.sendPromptDirect(
      trimmed,
      {
        channelId: selectedDirectChannelId.value || undefined,
        userSelectedSkillIds: selectedSendSkillIds.value,
      },
      buildContextSnapshot(trimmed),
    );
    if (task) {
      selectedTaskId.value = task.id;
      const latestAssistantMessage = task.conversationId
        ? [...aiStore.conversationMessages(task.conversationId)]
            .reverse()
            .find((message) => message.role === "assistant")
        : null;

      if (latestAssistantMessage?.status === "failed") {
        directSendError.value =
          latestAssistantMessage.content ||
          "发送失败，请检查渠道配置或网络后重试。";
        return;
      }
    }
    userInput.value = "";
    selectedSendSkillIds.value = [];
    showNewTaskPanel.value = false;
  } catch (error) {
    directSendError.value =
      error instanceof Error ? error.message : "发送失败，请稍后重试。";
  } finally {
    sendingDirectly.value = false;
  }
};

const selectedConversation = computed(() => {
  if (!selectedTask.value?.conversationId) return null;
  return aiStore.conversations[selectedTask.value.conversationId] ?? null;
});

watch(
  () => aiStore.activeChannel?.id,
  (channelId) => {
    const fallbackChannelId = channelId || channels.value[0]?.id || "";
    if (
      !selectedDirectChannelId.value ||
      !channels.value.some(
        (channel) => channel.id === selectedDirectChannelId.value,
      )
    ) {
      selectedDirectChannelId.value = fallbackChannelId;
    }
    if (
      !selectedConversation.value &&
      (!selectedConversationChannelId.value ||
        !channels.value.some(
          (channel) => channel.id === selectedConversationChannelId.value,
        ))
    ) {
      selectedConversationChannelId.value = fallbackChannelId;
    }
  },
  { immediate: true },
);

watch(
  () => selectedTask.value?.id,
  () => {
    selectedConversationChannelId.value =
      selectedConversation.value?.channelId ||
      aiStore.activeChannel?.id ||
      channels.value[0]?.id ||
      "";
    selectedConversationAgentId.value = selectedTask.value?.agentId || "";
    selectedConversationSkillIds.value = [
      ...(selectedTask.value?.skillIds ?? []),
    ];
  },
  { immediate: true },
);

watch(
  () => selectedConversation.value?.id,
  () => {
    selectedConversationChannelId.value =
      selectedConversation.value?.channelId ||
      aiStore.activeChannel?.id ||
      channels.value[0]?.id ||
      "";
  },
  { immediate: true },
);

watch(selectedConversationChannelId, (channelId) => {
  if (!selectedConversation.value || !channelId) return;

  const channel = channels.value.find((item) => item.id === channelId);
  aiStore.updateConversation(selectedConversation.value.id, {
    channelId,
    provider: channel?.provider,
    model: channel?.model,
  });
});

const conversationStatusText = computed(() => {
  const status = selectedConversation.value?.status;
  if (!status) return "未创建对话";
  return (
    {
      active: "对话进行中",
      paused: "对话已暂停",
      completed: "对话已完成",
      failed: "对话已失败",
    }[status] ?? "未知状态"
  );
});

const conversationMessages = computed(() => {
  if (!selectedTask.value?.conversationId) return [];
  return aiStore.conversationMessages(selectedTask.value.conversationId);
});

const conversationCompressThreshold = 16;
const conversationKeepRecent = 8;

const conversationSummaryStatus = computed(() => {
  const convId = selectedTask.value?.conversationId;
  if (!convId) return null;
  if (aiStore.summaryGenerating[convId]) return "generating";
  if (aiStore.conversationSummaries[convId]) return "ready";
  return null;
});

const visibleConversationMessages = computed(() => {
  const msgs = conversationMessages.value;
  if (msgs.length <= conversationCompressThreshold) return msgs;
  return msgs.slice(msgs.length - conversationKeepRecent);
});

const ensureConversationId = (): string | null => {
  if (!selectedTask.value) return null;

  if (!selectedTask.value.conversationId) {
    const channel =
      channels.value.find(
        (item) => item.id === selectedConversationChannelId.value,
      ) || aiStore.activeChannel;
    const conversation = aiStore.createConversation({
      taskId: selectedTask.value.id,
      title: selectedTask.value.title,
      channelId: channel?.id,
      provider: channel?.provider,
      model: channel?.model,
    });

    selectedTask.value.conversationId = conversation.id;
    selectedConversationChannelId.value =
      conversation.channelId || channel?.id || "";
  }

  return selectedTask.value.conversationId ?? null;
};

const sendMessage = async (): Promise<void> => {
  if (!selectedTask.value || !conversationInput.value.trim()) return;

  const conversationId = ensureConversationId();
  if (!conversationId) return;

  conversationSending.value = true;
  conversationError.value = "";

  aiStore.updateTask(selectedTask.value.id, {
    status: "running",
    progressText: "正在准备与 AI 协作...",
  });

  try {
    const message = await aiStore.sendConversationMessage(
      conversationId,
      conversationInput.value,
      {
        agentId: selectedConversationAgentId.value || undefined,
        channelId: selectedConversationChannelId.value || undefined,
        userSelectedSkillIds: selectedConversationSkillIds.value,
        contextSnapshot: buildContextSnapshot(conversationInput.value),
      },
    );
    if (message?.status === "failed") {
      conversationError.value =
        message.content || "发送失败，请检查渠道配置或网络后重试。";
      return;
    }
    conversationInput.value = "";
  } catch (error) {
    conversationError.value =
      error instanceof Error ? error.message : "发送失败，请稍后重试。";
  } finally {
    conversationSending.value = false;
    auditRefreshKey.value += 1;
  }
};

const retryAssistantMessage = (messageId: string): void => {
  if (!selectedTask.value?.conversationId) return;

  const messages = aiStore.conversationMessages(
    selectedTask.value.conversationId,
  );
  const target = messages.find((item) => item.id === messageId);
  if (!target || target.role !== "assistant" || target.status !== "failed")
    return;

  const lastUserMessage = [...messages]
    .reverse()
    .find((item) => item.role === "user" && item.createdAt <= target.createdAt);
  if (lastUserMessage) {
    conversationInput.value = lastUserMessage.content;
    sendMessage();
  }
};

const selectedTaskSuggestions = computed(() =>
  aiStore.taskArtifacts(selectedTask.value?.conversationId),
);

const appendKnowledgeContextLinks = (
  markdownContent: string,
  docTitle: string,
): string => {
  const links: string[] = [];

  if (selectedTask.value?.title) {
    links.push(`- 来源任务：${selectedTask.value.title}`);
  } else if (docTitle) {
    links.push(`- 来源任务：${docTitle}`);
  }

  if (fileStore.currentFilePath && knowledgeGraphStore.vaultPath) {
    const relativePath = getRelativePath(
      knowledgeGraphStore.vaultPath,
      fileStore.currentFilePath,
    );
    const currentTitle =
      relativePath
        .split(/[\\/]/)
        .pop()
        ?.replace(/\.(md|markdown)$/i, "") || relativePath;
    links.push(`- 关联文件：[[${currentTitle}]]（${relativePath}）`);
  } else if (fileStore.currentFilePath) {
    links.push(`- 关联文件：${fileStore.currentFilePath}`);
  }

  const snippetLinks = previewKnowledgeSnippets.value
    .filter((snippet) => snippet.path)
    .slice(0, 3)
    .map((snippet) => {
      const title =
        snippet
          .path!.split(/[\\/]/)
          .pop()
          ?.replace(/\.(md|markdown)$/i, "") || snippet.title;
      return `- 上下文片段：[[${title}]]（${snippet.path}）`;
    });

  links.push(...snippetLinks);
  if (!links.length) return markdownContent;

  return `${markdownContent}\n\n## 来源与关联\n\n${Array.from(new Set(links)).join("\n")}`;
};

const activateSavedDocument = (filePath: string): void => {
  window.dispatchEvent(
    new CustomEvent(WINDOW_EVENTS.OPEN_DOCUMENT_IN_EDITOR, {
      detail: { path: filePath },
    }),
  );
  window.dispatchEvent(
    new CustomEvent("switch-main-view", { detail: { view: "editor" } }),
  );
};

const saveDocumentArtifact = async (
  conversationId: string,
  docTitle: string,
  markdownContent: string,
  preferVault = false,
): Promise<void> => {
  const enrichedContent = appendKnowledgeContextLinks(
    markdownContent,
    docTitle,
  );
  const result = await aiStore.saveDocumentToLocal(docTitle, enrichedContent, {
    preferVault: preferVault || aiStore.settings.saveDocumentsToCurrentVault,
    vaultPath: knowledgeGraphStore.vaultPath,
  });

  if (result.success) {
    aiStore.addArtifact({
      conversationId,
      type: "document",
      title: `文档：${docTitle}`,
      summary: result.usedFallback
        ? `已保存到默认 AI 文档路径：${result.filePath}`
        : `已保存到：${result.filePath}`,
      filePath: result.filePath,
    });
    if (result.filePath) {
      fileStore.setCurrentFilePath(result.filePath);
      fileStore.addRecentFile(
        result.filePath,
        knowledgeGraphStore.vaultPath,
        knowledgeGraphStore.vaultName || null,
      );
      fileStore.markSaved(result.filePath);
      activateSavedDocument(result.filePath);
      if (knowledgeGraphStore.vaultPath && !result.usedFallback) {
        await knowledgeGraphStore.refresh();
      }
    }
    notifySuccess(
      result.usedFallback
        ? `知识库不可用，已回退保存并打开：${result.filePath}`
        : `文档已保存到知识库、打开并刷新索引：${result.filePath}`,
    );
  } else {
    notifyWarning(
      `本地保存失败（${result.error}），已改为保存为内部建议记录。`,
    );
  }
};

const addSuggestion = (type: AIArtifactType, preferVault = false): void => {
  if (!selectedTask.value) return;

  const conversationId = ensureConversationId();
  if (!conversationId) return;

  if (type === "document") {
    const lastContent =
      conversationMessages.value
        .filter((m) => m.role === "assistant" && m.status === "completed")
        .pop()?.content || "";

    if (lastContent.length > 50) {
      const docTitle = selectedTask.value.title || "未命名文档";
      const markdownContent = `# ${docTitle}\n\n${lastContent}\n\n---\n*由 workgaga AI 生成，时间：${new Date().toLocaleString()}*`;

      saveDocumentArtifact(
        conversationId,
        docTitle,
        markdownContent,
        preferVault,
      ).catch(() => {
        notifyWarning("本地保存异常，已改为保存为内部记录。");
      });
    }
  }

  if (type !== "document") {
    aiStore.addArtifact({
      conversationId,
      type,
      title: `${artifactTypeText(type)}：${selectedTask.value.title}`,
      summary: `基于当前任务对话生成的${artifactTypeText(type)}建议，可进一步整理或沉淀。`,
    });
  }
};

const artifactTypeText = (type: AIArtifactType): string =>
  ({
    document: "文档建议",
    todo: "待办建议",
    schedule: "日程建议",
    knowledge: "知识沉淀建议",
  })[type];

const useQuickAction = (action: string): void => {
  userInput.value = `帮我${action}`;
  activeTab.value = "chat";
};

const onSkillToggle = (id: string, event: Event): void => {
  const { target } = event;
  if (!(target instanceof HTMLInputElement)) return;
  aiStore.updateSkill(id, { enabled: target.checked });
};

const onAgentToggle = (id: string, event: Event): void => {
  const { target } = event;
  if (!(target instanceof HTMLInputElement)) return;
  aiStore.updateAgent(id, { enabled: target.checked });
};

const addSkill = (): void => {
  const name = newSkillName.value.trim();
  if (!name) return;
  aiStore.addSkill({
    name,
    description: "用户自定义 Skill。",
    whenToUse: `当用户需要 ${name} 时使用。`,
    category: "general",
    promptTemplate: `使用 ${name} 能力帮助用户完成目标。先理解任务，再判断是否需要文档、待办、日程或知识沉淀。`,
    enabled: true,
    userInvocable: true,
    outputPolicy: {
      mayCreateDocument: true,
      mayCreateTodo: true,
      mayCreateSchedule: true,
      mayUpdateKnowledgeBase: true,
    },
  } satisfies Omit<AISkill, "id" | "builtin" | "createdAt" | "updatedAt">);
  newSkillName.value = "";
};

const addAgent = (): void => {
  const name = newAgentName.value.trim();
  if (!name) return;
  aiStore.addAgent({
    name,
    description: "用户自定义 Agent。",
    whenToUse: `当任务适合由 ${name} 专门处理时使用。`,
    systemPrompt: `你是 ${name}。你是 workgaga 万能 AI 背后的专业执行者，必须服务于用户目标，不要把知识库或日程作为默认主线。`,
    enabled: true,
    allowedSkills: aiStore.skills
      .filter((skill) => skill.enabled)
      .map((skill) => skill.id),
    allowedTools: [
      "read-context",
      "write-document",
      "manage-task",
      "manage-schedule",
      "use-knowledge",
    ],
    permissionMode: "ask",
    memoryScope: "workspace",
    runMode: "foreground",
  } satisfies Omit<
    AIAgent,
    "id" | "builtin" | "usageCount" | "createdAt" | "updatedAt"
  >);
  newAgentName.value = "";
};

const skillGithubUrl = ref("");
const skillGithubInstalling = ref(false);
const skillGithubMessage = ref("");

const agentGithubUrl = ref("");
const agentGithubInstalling = ref(false);
const agentGithubMessage = ref("");

const installSkillFromGithub = async (): Promise<void> => {
  if (!skillGithubUrl.value.trim()) return;

  skillGithubInstalling.value = true;
  skillGithubMessage.value = "";

  try {
    const manifest = await aiStore.installPluginFromGitHub(
      skillGithubUrl.value,
    );
    skillGithubMessage.value = `已安装 Skill 插件：${manifest.name}(${manifest.version})`;
    skillGithubUrl.value = "";
  } catch (error) {
    skillGithubMessage.value =
      error instanceof Error
        ? `安装失败：${error.message}`
        : "安装失败，请稍后重试。";
  } finally {
    skillGithubInstalling.value = false;
  }
};

const installAgentFromGithub = async (): Promise<void> => {
  if (!agentGithubUrl.value.trim()) return;

  agentGithubInstalling.value = true;
  agentGithubMessage.value = "";

  try {
    const manifest = await aiStore.installPluginFromGitHub(
      agentGithubUrl.value,
    );
    agentGithubMessage.value = `已安装 Agent 插件：${manifest.name}(${manifest.version})`;
    agentGithubUrl.value = "";
  } catch (error) {
    agentGithubMessage.value =
      error instanceof Error
        ? `安装失败：${error.message}`
        : "安装失败，请稍后重试。";
  } finally {
    agentGithubInstalling.value = false;
  }
};

const skillSkillHubUrl = ref("");
const skillSkillHubInstalling = ref(false);
const skillSkillHubMessage = ref("");

const agentSkillHubUrl = ref("");
const agentSkillHubInstalling = ref(false);
const agentSkillHubMessage = ref("");

const installSkillFromSkillHub = async (): Promise<void> => {
  if (!skillSkillHubUrl.value.trim()) return;

  skillSkillHubInstalling.value = true;
  skillSkillHubMessage.value = "";

  try {
    const manifest = await aiStore.installPluginFromSkillHub(
      skillSkillHubUrl.value,
    );
    skillSkillHubMessage.value = `已安装 Skill 插件：${manifest.name}(${manifest.version})`;
    skillSkillHubUrl.value = "";
  } catch (error) {
    skillSkillHubMessage.value =
      error instanceof Error
        ? `安装失败：${error.message}`
        : "安装失败，请稍后重试。";
  } finally {
    skillSkillHubInstalling.value = false;
  }
};

const installAgentFromSkillHub = async (): Promise<void> => {
  if (!agentSkillHubUrl.value.trim()) return;

  agentSkillHubInstalling.value = true;
  agentSkillHubMessage.value = "";

  try {
    const manifest = await aiStore.installPluginFromSkillHub(
      agentSkillHubUrl.value,
    );
    agentSkillHubMessage.value = `已安装 Agent 插件：${manifest.name}(${manifest.version})`;
    agentSkillHubUrl.value = "";
  } catch (error) {
    agentSkillHubMessage.value =
      error instanceof Error
        ? `安装失败：${error.message}`
        : "安装失败，请稍后重试。";
  } finally {
    agentSkillHubInstalling.value = false;
  }
};

const installedSkillList = computed(() =>
  Object.values(aiStore.installedSkillPlugins),
);
const installedAgentList = computed(() =>
  Object.values(aiStore.installedAgentPlugins),
);

const refreshLocalPlugins = async (): Promise<void> => {
  await aiStore.loadLocalPlugins();
};

const uninstallInstalledPlugin = async (id: string): Promise<void> => {
  await aiStore.uninstallPlugin(id);
};

const updateSettingsFromUI = (): void => {
  const maxKnowledgeSnippets = Number(settings.maxKnowledgeSnippets);
  settings.maxKnowledgeSnippets = Number.isFinite(maxKnowledgeSnippets)
    ? Math.min(20, Math.max(0, Math.floor(maxKnowledgeSnippets)))
    : 5;
  aiStore.updateSettings(settings);
};

const chooseAIDocumentSavePath = async (): Promise<void> => {
  const selected = await open({ directory: true, multiple: false });
  if (!selected) return;

  const path = Array.isArray(selected) ? selected[0] : selected;
  if (!path) return;

  settings.aiDocumentSavePath = path;
  updateSettingsFromUI();
};

const statusText = (status: AITaskStatus): string =>
  ({
    pending: "待处理",
    running: "进行中",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
  })[status];

const categoryText = (category: AICategory): string =>
  ({
    general: "通用",
    writing: "写作",
    research: "研究",
    planning: "规划",
    organizing: "整理",
    automation: "自动化",
  })[category];

const outputKindText = (kind: AIOutputKind): string =>
  ({
    document: "文档",
    todo: "待办",
    schedule: "日程",
    knowledge: "知识",
  })[kind];

const activeAgent = computed(() => {
  if (!selectedTask.value?.agentId) return null;
  return (
    aiStore.agents.find((a) => a.id === selectedTask.value!.agentId) ?? null
  );
});

const selectedSkillNames = computed(() => {
  if (!selectedTask.value?.skillIds?.length) return [];
  return selectedTask.value.skillIds
    .map((id) => aiStore.skills.find((s) => s.id === id)?.name)
    .filter((name): name is string => Boolean(name));
});

const currentDraftInput = computed(
  () => conversationInput.value.trim() || userInput.value.trim(),
);
const previewKnowledgeSnippets = computed(() =>
  currentDraftInput.value && aiStore.settings.showKnowledgeSnippetPreview
    ? retrieveKnowledgeSnippets(currentDraftInput.value)
    : [],
);
const previewKnowledgeSnippetCount = computed(
  () => previewKnowledgeSnippets.value.length,
);
const knowledgeSnippetPreviewText = computed(() => {
  if (!aiStore.settings.enableKnowledgeSnippetInjection)
    return "已关闭知识片段注入";
  if (!currentDraftInput.value) return "输入后自动检索";
  return `已检索 ${previewKnowledgeSnippets.value.length} 个`;
});

const contextSummaryItems = computed(() => {
  const items: {
    label: string;
    value: string;
    kind: string;
    action?: () => void;
  }[] = [];

  if (activeAgent.value) {
    items.push({
      label: "Agent",
      value: activeAgent.value.name,
      kind: "agent",
      action: () => {
        activeTab.value = "agents";
      },
    });
  }

  if (selectedSkillNames.value.length > 0) {
    items.push({
      label: "Skill",
      value: selectedSkillNames.value.join("、"),
      kind: "skill",
      action: () => {
        activeTab.value = "skills";
      },
    });
  }

  const fileName = currentFileName.value;
  if (fileName && fileName !== "未打开") {
    items.push({
      label: "文件",
      value: fileName,
      kind: "file",
    });
  }

  const { vaultName } = knowledgeGraphStore;
  if (vaultName) {
    items.push({
      label: "知识库",
      value: `${vaultName}（${knowledgeGraphStore.noteCount} 篇）`,
      kind: "knowledge",
      action: () => {
        window.dispatchEvent(
          new CustomEvent("switch-main-view", { detail: { view: "editor" } }),
        );
      },
    });
    items.push({
      label: "知识片段",
      value: currentDraftInput.value
        ? `将注入 ${previewKnowledgeSnippetCount.value} 个`
        : "输入后自动检索",
      kind: "knowledge",
    });
  } else {
    items.push({
      label: "知识库",
      value: "未打开",
      kind: "knowledge",
      action: () => {
        notifyWarning(
          "请在左侧文件管理器中打开知识库目录，系统会自动索引其中的 Markdown 文档。",
        );
        window.dispatchEvent(
          new CustomEvent("switch-main-view", { detail: { view: "editor" } }),
        );
      },
    });
  }

  if (selectedTask.value) {
    const category = categoryText(selectedTask.value.category);
    const outputKinds =
      selectedTask.value.outputKinds.map(outputKindText).join("、") ||
      "直接回答";
    items.push({
      label: "类型",
      value: `${category} · ${outputKinds}`,
      kind: "task",
      action: () => {
        activeTab.value = "tasks";
      },
    });
  }

  return items;
});

const ACTION_SIGNAL =
  /需要|完成|准备|跟进|安排|处理|确认|检查|提交|发送|联系|更新/;

const extractTodoItemsFromContent = (content: string): string[] => {
  const items: string[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    const checkboxMatch = trimmed.match(/^[-*]\s*\[[ x]\]\s*(.+)/i);
    if (checkboxMatch) {
      items.push(checkboxMatch[1].trim());
      continue;
    }

    const numberedMatch = trimmed.match(/^\d+[.)]\s*(.+)/);
    if (numberedMatch && ACTION_SIGNAL.test(numberedMatch[1])) {
      items.push(numberedMatch[1].trim());
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (
      bulletMatch &&
      ACTION_SIGNAL.test(bulletMatch[1]) &&
      bulletMatch[1].length > 6
    ) {
      items.push(bulletMatch[1].trim());
    }
  }

  return items.slice(0, 20);
};

const extractScheduleItemsFromContent = (
  content: string,
): { title: string; date?: string; time?: string }[] => {
  const items: { title: string; date?: string; time?: string }[] = [];
  const lines = content.split("\n");

  const today = new Date();
  const dateMap: Record<string, () => string> = {
    今天: () => formatDateKey(today),
    明天: () => {
      const d = new Date(today);
      d.setDate(d.getDate() + 1);
      return formatDateKey(d);
    },
    后天: () => {
      const d = new Date(today);
      d.setDate(d.getDate() + 2);
      return formatDateKey(d);
    },
    下周: () => {
      const d = new Date(today);
      d.setDate(d.getDate() + 7);
      return formatDateKey(d);
    },
    本周: () => {
      const d = new Date(today);
      d.setDate(d.getDate() + (7 - d.getDay()));
      return formatDateKey(d);
    },
  };

  const dateRegex = /(\d{4}[-/]\d{1,2}[-/]\d{1,2})/;
  const timeRegex = /(\d{1,2}[点:：]\d{0,2}(?:\s*(?:AM|PM|am|pm))?)/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 4) continue;

    let detectedDate: string | undefined;
    let detectedTime: string | undefined;

    const dateMatch = trimmed.match(dateRegex);
    if (dateMatch) {
      detectedDate = dateMatch[1].replace(/\//g, "-");
    } else {
      for (const [keyword, formatter] of Object.entries(dateMap)) {
        if (trimmed.includes(keyword)) {
          detectedDate = formatter();
          break;
        }
      }
    }

    const timeMatch = trimmed.match(timeRegex);
    if (timeMatch) {
      detectedTime = timeMatch[1].replace(/[点]/g, ":").replace(/[：]/g, ":");
      if (detectedTime.indexOf(":") === -1) {
        detectedTime = detectedTime.replace(/(\d+).*/, "$1:00");
      }
    }

    if (detectedDate || detectedTime) {
      const titleText = trimmed
        .replace(dateRegex, "")
        .replace(timeRegex, "")
        .replace(/^[-*]\s*\[[ x]\]\s*/, "")
        .replace(/^[-*]\s+/, "")
        .replace(/^\d+[.)]\s*/, "")
        .trim();

      if (titleText.length > 2) {
        items.push({
          title: titleText.slice(0, 80),
          date: detectedDate,
          time: detectedTime,
        });
      }
    }
  }

  return items.slice(0, 10);
};

const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const adoptSuggestion = (type: AIArtifactType): void => {
  const artifact = selectedTaskSuggestions.value.find(
    (item) => item.type === type,
  );
  if (!artifact) return;

  const lastAssistantContent =
    conversationMessages.value
      .filter((m) => m.role === "assistant" && m.status === "completed")
      .pop()?.content || "";

  const task = selectedTask.value;
  let directAdopted = false;

  if (type === "document" && lastAssistantContent.length > 50) {
    const docTitle = task?.title || "未命名文档";
    const markdownContent = `# ${docTitle}\n\n${lastAssistantContent}\n\n---\n*由 workgaga AI 生成，时间：${new Date().toLocaleString()}*`;

    saveDocumentArtifact(
      artifact.conversationId,
      docTitle,
      markdownContent,
    ).catch(() => {
      notifyWarning("本地保存异常，已改为保存为内部建议记录。");
    });
    directAdopted = true;
  } else if (type === "todo" && lastAssistantContent.length > 20) {
    const todoItems = extractTodoItemsFromContent(lastAssistantContent);
    if (todoItems.length > 0) {
      const today = formatDateKey(new Date());
      for (const item of todoItems) {
        dashboardStore.addTodo(item, today);
      }
      directAdopted = true;
    }
  } else if (type === "schedule" && lastAssistantContent.length > 20) {
    const scheduleItems = extractScheduleItemsFromContent(lastAssistantContent);
    if (scheduleItems.length > 0) {
      for (const item of scheduleItems) {
        dashboardStore.addSchedule(
          item.title,
          item.date || formatDateKey(new Date()),
          item.time,
        );
      }
      directAdopted = true;
    }
  } else if (type === "knowledge" && lastAssistantContent.length > 50) {
    const keyPoints = lastAssistantContent
      .split("\n")
      .filter((l) => l.trim().length > 4)
      .slice(0, 10)
      .join("\n");

    aiStore.addArtifact({
      conversationId: artifact.conversationId,
      type: "knowledge",
      title: `知识沉淀：${task?.title || "未命名"}`,
      summary: keyPoints.slice(0, 300) || "从对话中提取的知识沉淀。",
    });
    directAdopted = true;
  }

  if (!directAdopted) {
    if (type === "document") {
      conversationInput.value = `请将本次对话内容整理成一份完整的 Markdown 文档，标题为"${task?.title}"，包含所有关键信息、结论和下一步。`;
      sendMessage();
    } else if (type === "todo") {
      conversationInput.value =
        "请从本次对话中提取所有待办事项，格式为：[ ] 任务描述（负责人/截止时间）。";
      sendMessage();
    } else if (type === "schedule") {
      conversationInput.value =
        "请从本次对话中提取所有与时间相关的事项，整理成日程条目，包含日期、时间和描述。";
      sendMessage();
    } else if (type === "knowledge") {
      conversationInput.value =
        "请将本次对话中的关键结论、方法论或经验总结整理为知识沉淀格式，包含标题、标签和摘要。";
      sendMessage();
    }
  }

  aiStore.removeArtifact(artifact.id);
};
</script>

<style scoped>
.ai-page {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #f4f6fb;
  color: #111827;
  display: flex;
  flex-direction: column;
}

.page-header {
  padding: 22px 26px;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  gap: 24px;
}

.eyebrow,
.section-title,
.muted,
.meta-row span,
.mini-grid span,
.header-stats span,
.manage-card small,
.composer-actions span {
  color: #6b7280;
  font-size: 12px;
}

.page-header h1 {
  margin: 3px 0;
  font-size: 28px;
}

.page-header p,
.manage-card p,
.detail-card p {
  margin: 0;
  color: #4b5563;
  font-size: 13px;
}

.header-stats {
  display: grid;
  grid-template-columns: repeat(4, 84px);
  gap: 10px;
}

.header-stats div,
.mini-grid div {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #f9fafb;
  padding: 10px;
}

.header-stats strong,
.header-stats span,
.mini-grid strong,
.mini-grid span {
  display: block;
}

.workspace-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 260px minmax(520px, 1fr) 300px;
  gap: 16px;
  padding: 16px;
  overflow: hidden;
}

.left-rail,
.right-rail,
.center-stage {
  min-height: 0;
  overflow: auto;
}

.card,
.composer-card,
.detail-card,
.table-card,
.manage-card,
.settings-grid {
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #ffffff;
  padding: 14px;
  margin-bottom: 14px;
}

.meta-row,
.overview-line,
.section-header,
.detail-header,
.item-heading,
.composer-actions,
.manager-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.meta-row,
.overview-line {
  margin-top: 10px;
}

.mini-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 12px;
}

.quick-btn,
.tab-bar button,
button,
.add-form button {
  border: 1px solid #d8dee9;
  border-radius: 9px;
  background: #fff;
  color: #1f2937;
  cursor: pointer;
  font-size: 12px;
  padding: 8px 11px;
}

.quick-btn {
  display: block;
  width: 100%;
  text-align: left;
  margin-top: 8px;
}

.tab-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.tab-bar button.active,
.primary-btn {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.panel-section {
  min-height: 0;
}

.chat-workbench {
  display: grid;
  grid-template-columns: 280px minmax(420px, 1fr) 300px;
  gap: 14px;
  height: calc(100vh - 190px);
  min-height: 560px;
}

.conversation-history-panel,
.current-conversation-panel,
.conversation-side-panel {
  min-height: 0;
  overflow: auto;
}

.conversation-history-panel,
.current-conversation-panel {
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #ffffff;
}

.conversation-panel-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-bottom: 1px solid #eef2f7;
}

.conversation-panel-head p,
.conversation-titlebar p,
.empty-conversation-state p {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 12px;
}

.compact-btn {
  white-space: nowrap;
  padding: 7px 10px;
}

.new-task-panel {
  padding: 12px;
  border-bottom: 1px solid #eef2f7;
  background: #f8fafc;
}

.new-task-panel label,
.side-field {
  display: block;
  margin-top: 10px;
}

.new-task-panel label span,
.side-field span {
  display: block;
  margin-bottom: 6px;
  color: #6b7280;
  font-size: 12px;
}

.full-btn {
  width: 100%;
  margin-top: 10px;
}

.conversation-list {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.conversation-list-item {
  width: 100%;
  text-align: left;
  border-radius: 12px;
  padding: 10px;
  background: #fff;
  border: 1px solid #e5e7eb;
}

.conversation-list-item.active {
  border-color: #2563eb;
  background: #eff6ff;
}

.conversation-list-item strong,
.conversation-list-item span,
.conversation-list-item small {
  display: block;
}

.conversation-list-item span {
  margin-top: 5px;
  color: #4b5563;
  font-size: 12px;
  line-height: 1.4;
  max-height: 34px;
  overflow: hidden;
}

.conversation-list-item small {
  margin-top: 6px;
  color: #6b7280;
}

.run-timeline-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 8px 0;
  padding: 8px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
}

.run-timeline-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 12px;
  color: #475569;
}

.run-timeline-item small {
  display: block;
  margin-top: 2px;
  color: #64748b;
}

.timeline-dot {
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 999px;
  background: #94a3b8;
  flex: 0 0 auto;
}

.run-timeline-item.completed .timeline-dot {
  background: #22c55e;
}

.run-timeline-item.running .timeline-dot {
  background: #3b82f6;
}

.run-timeline-item.failed .timeline-dot {
  background: #ef4444;
}

.run-timeline-item.blocked .timeline-dot {
  background: #f59e0b;
}

.tool-event-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 8px 0;
}

.tool-event-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  font-size: 12px;
  color: #475569;
}

.tool-event-item.error {
  border-color: #fecaca;
  background: #fef2f2;
  color: #991b1b;
}

.tool-event-item.result {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #166534;
}

.tool-event-type {
  padding: 2px 6px;
  border-radius: 999px;
  background: #e0e7ff;
  color: #3730a3;
  font-weight: 700;
}

.task-run-panel {
  border-color: #bfdbfe;
  background: #eff6ff;
}

.task-run-card {
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
  background: #fff;
}

.task-step-list {
  margin: 0;
  padding-left: 18px;
}

.task-step-list li {
  margin-bottom: 4px;
}

.task-step-completed {
  color: #15803d;
}

.task-step-running {
  color: #2563eb;
}

.task-step-blocked,
.task-step-failed {
  color: #b91c1c;
}

.permission-request-panel {
  border-color: #fbbf24;
  background: #fffbeb;
}

.permission-request-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid #fde68a;
  background: #fff;
  font-size: 12px;
}

.permission-request-card p {
  margin: 0;
  color: #78350f;
}

.permission-request-card pre {
  max-height: 120px;
  overflow: auto;
  margin: 0;
  padding: 8px;
  border-radius: 8px;
  background: #f8fafc;
  color: #334155;
  white-space: pre-wrap;
}

.diff-preview .added {
  display: block;
  background: #dcfce7;
  color: #166534;
}

.diff-preview .removed {
  display: block;
  background: #fee2e2;
  color: #991b1b;
}

.permission-actions {
  display: flex;
  gap: 8px;
}

.ghost-danger {
  border-color: #fecaca;
  background: #fef2f2;
  color: #991b1b;
}

.audit-log-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.audit-log-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #f8fafc;
  font-size: 12px;
}

.audit-log-item.allow {
  border-color: #bbf7d0;
  background: #f0fdf4;
}

.audit-log-item.ask {
  border-color: #fde68a;
  background: #fffbeb;
}

.audit-log-item.deny {
  border-color: #fecaca;
  background: #fef2f2;
}

.audit-log-item span,
.audit-log-item small {
  color: #64748b;
}

.current-conversation-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.conversation-titlebar {
  padding: 16px;
  border-bottom: 1px solid #eef2f7;
}

.conversation-titlebar h2 {
  margin: 3px 0 0;
}

.focused-conversation-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin: 0;
  border: 0;
  border-radius: 0;
  min-height: 0;
}

.focused-messages {
  flex: 1;
  max-height: none;
}

.sticky-composer {
  border-top: 1px solid #e5e7eb;
  background: #ffffff;
}

.sticky-composer textarea {
  min-height: 92px;
}

.send-config-bar {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 10px;
}

.send-config-bar label span {
  display: block;
  margin-bottom: 6px;
  color: #6b7280;
  font-size: 12px;
}

.current-send-skills {
  margin-bottom: 10px;
}

.compact-skill-picker {
  gap: 6px;
}

.empty-conversation-state {
  margin: auto;
  max-width: 440px;
  text-align: center;
  padding: 28px;
}

.empty-conversation-state h2 {
  margin: 8px 0;
}

.conversation-side-panel .card {
  margin-bottom: 12px;
}

.context-summary-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.context-summary-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  text-align: left;
  background: #f8fafc;
}

.vertical-actions {
  flex-direction: column;
}

.vertical-actions button {
  width: 100%;
}

.compact-empty {
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
}

@media (max-width: 1320px) {
  .chat-workbench {
    grid-template-columns: 260px minmax(380px, 1fr);
  }

  .conversation-side-panel {
    display: none;
  }
}

textarea,
input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #d8dee9;
  border-radius: 10px;
  padding: 10px;
  color: #111827;
  background: #fff;
  font-size: 13px;
}

textarea {
  min-height: 140px;
  resize: vertical;
}

.prompt-preview {
  min-height: 280px;
  margin-top: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  line-height: 1.5;
}

.chip-list,
.action-row,
.output-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 10px;
}

.chip-list span,
.status {
  border-radius: 999px;
  background: #eef2ff;
  color: #3730a3;
  padding: 4px 8px;
  font-size: 11px;
}

.status.running {
  background: #dbeafe;
  color: #1d4ed8;
}
.status.completed {
  background: #dcfce7;
  color: #166534;
}
.status.failed {
  background: #fee2e2;
  color: #991b1b;
}
.status.cancelled {
  background: #f3f4f6;
  color: #4b5563;
}

.table-row {
  display: grid;
  grid-template-columns: 1.5fr 90px 80px 1.2fr 70px;
  gap: 10px;
  align-items: center;
  border-bottom: 1px solid #eef2f7;
  padding: 10px 0;
  font-size: 13px;
}

.table-head {
  color: #6b7280;
  font-size: 12px;
  font-weight: 600;
}

.table-title {
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
  font-weight: 600;
}

.danger {
  color: #b91c1c;
}

.manager-head {
  margin-bottom: 14px;
}

.manager-head h2,
.manage-card h3,
.detail-card h2 {
  margin: 0 0 4px;
}

.conversation-area {
  margin-top: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
}

.conversation-messages {
  max-height: 320px;
  overflow: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #fafafa;
}

.conversation-empty {
  padding: 16px;
  text-align: center;
  color: #6b7280;
  font-size: 13px;
}

.conversation-compressed-hint {
  padding: 8px 12px;
  text-align: center;
  color: #6b7280;
  font-size: 11px;
  background: #f1f5f9;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  margin-bottom: 6px;
}

.summary-status {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
}

.summary-status.generating {
  background: #dbeafe;
  color: #1d4ed8;
  animation: pulse-bg 1.5s ease-in-out infinite;
}

.summary-status.ready {
  background: #dcfce7;
  color: #166534;
}

@keyframes pulse-bg {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.conversation-message {
  padding: 10px 12px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid #e5e7eb;
}

.conversation-message.user {
  border-left: 3px solid #2563eb;
}

.conversation-message.assistant {
  border-left: 3px solid #10b981;
}

.conversation-message.failed {
  border-color: #ef4444;
  background: #fff7f7;
}

.conversation-message.sending {
  opacity: 0.85;
}

.conversation-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 12px;
  color: #6b7280;
}

.conversation-content {
  white-space: pre-wrap;
  font-size: 13px;
  line-height: 1.5;
}

.conversation-actions {
  margin-top: 8px;
}

.conversation-composer {
  border-top: 1px solid #e5e7eb;
  padding: 10px 12px;
  background: #fff;
}

.conversation-composer textarea {
  min-height: 72px;
}

.conversation-error {
  color: #ef4444;
  font-size: 12px;
}

.add-form {
  min-width: 280px;
  display: flex;
  gap: 8px;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.settings-grid {
  display: grid;
  gap: 14px;
}

select {
  width: 100%;
  border: 1px solid #d8dee9;
  border-radius: 10px;
  padding: 10px;
  font-size: 13px;
  color: #111827;
  background: #fff;
}

.settings-block {
  border: 1px solid #eef2f7;
  border-radius: 12px;
  background: #f9fafb;
  padding: 12px;
}

.inline-note {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #9ca3af;
}

.status-dot.success {
  background: #16a34a;
}

.status-dot.warn {
  background: #f59e0b;
}

.provider-tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 6px;
  background: #f3f4f6;
}

input[required]:invalid {
  border-color: #ef4444;
}

.key-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.test-result {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 8px;
  background: #f9fafb;
}

.test-result.success {
  border-color: #bbf7d0;
  background: #f0fdf4;
}

.test-result.error {
  border-color: #fecaca;
  background: #fef2f2;
}

.settings-grid label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-grid input[type="checkbox"] {
  width: auto;
}

.side-list,
.confirm-list {
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
}

.side-list li,
.confirm-list li {
  border-bottom: 1px solid #eef2f7;
  padding: 8px 0;
  font-size: 12px;
}

.side-list button {
  width: 100%;
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
}

.side-list strong,
.side-list span {
  display: block;
}

.empty {
  color: #6b7280;
}

.send-skill-picker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
}

.send-skill-label {
  color: #6b7280;
  font-size: 12px;
  white-space: nowrap;
}

.send-skill-chip {
  border: 1px solid #d8dee9;
  border-radius: 999px;
  background: #f9fafb;
  color: #4b5563;
  font-size: 11px;
  padding: 4px 10px;
  cursor: pointer;
  transition: all 0.15s;
}

.send-skill-chip.active {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
}

.send-skill-chip:hover {
  border-color: #93c5fd;
}

.send-skill-empty {
  color: #9ca3af;
  font-size: 11px;
}

.context-summary-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
  padding: 8px 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}

.context-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 11px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  color: #475569;
}

.context-tag.agent {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}
.context-tag.skill {
  background: #f0fdf4;
  border-color: #bbf7d0;
  color: #166534;
}
.context-tag.file {
  background: #fefce8;
  border-color: #fef08a;
  color: #854d0e;
}
.context-tag.knowledge {
  background: #faf5ff;
  border-color: #e9d5ff;
  color: #7c3aed;
}
.context-tag.task {
  background: #fff7ed;
  border-color: #fed7aa;
  color: #c2410c;
}

.context-tag.clickable {
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}

.context-tag.clickable:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}

.context-tag.clickable:active {
  transform: translateY(0);
}

.context-tag-label {
  color: inherit;
  opacity: 0.7;
  font-weight: 500;
}

.context-tag-value {
  color: inherit;
  font-weight: 600;
}

.knowledge-preview {
  margin-top: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fafafa;
  padding: 10px;
}

.knowledge-preview.compact {
  margin: 8px 0;
  background: #f8fafc;
}

.knowledge-preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.knowledge-preview-header div,
.knowledge-preview-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.knowledge-preview-header strong,
.knowledge-preview-item strong {
  font-size: 12px;
  color: #374151;
}

.knowledge-preview-header span,
.knowledge-preview-item small {
  font-size: 11px;
  color: #6b7280;
}

.knowledge-preview-list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.knowledge-preview-item {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  padding: 8px;
}

.knowledge-preview-item p {
  margin: 0;
  color: #4b5563;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  max-height: 96px;
  overflow: hidden;
}

.auto-suggestion-panel {
  margin-top: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fafbfc;
  padding: 14px;
}

.auto-suggestion-panel .section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.suggestion-badge {
  border-radius: 999px;
  background: #2563eb;
  color: #fff;
  font-size: 10px;
  padding: 2px 7px;
  font-weight: 600;
}

.suggestion-card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  padding: 12px;
  margin-bottom: 8px;
}

.suggestion-card:last-child {
  margin-bottom: 0;
}

.suggestion-card.document {
  border-left: 3px solid #2563eb;
}
.suggestion-card.todo {
  border-left: 3px solid #f59e0b;
}
.suggestion-card.schedule {
  border-left: 3px solid #8b5cf6;
}
.suggestion-card.knowledge {
  border-left: 3px solid #10b981;
}

.suggestion-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.suggestion-type-tag {
  border-radius: 6px;
  background: #eef2ff;
  color: #3730a3;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}

.suggestion-card.document .suggestion-type-tag {
  background: #eff6ff;
  color: #1d4ed8;
}
.suggestion-card.todo .suggestion-type-tag {
  background: #fffbeb;
  color: #b45309;
}
.suggestion-card.schedule .suggestion-type-tag {
  background: #f5f3ff;
  color: #6d28d9;
}
.suggestion-card.knowledge .suggestion-type-tag {
  background: #ecfdf5;
  color: #059669;
}

.suggestion-summary {
  margin: 0 0 8px;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.5;
}

.suggestion-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.suggestion-adopt {
  font-size: 12px;
  padding: 5px 14px;
}

.suggestion-dismiss {
  border: 0;
  background: transparent;
  color: #9ca3af;
  font-size: 12px;
  padding: 5px 8px;
  cursor: pointer;
}

.suggestion-dismiss:hover {
  color: #6b7280;
}
</style>
