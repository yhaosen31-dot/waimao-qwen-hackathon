# Devpost Submission Draft

## Project Name

Waimao Agent Platform

## Tagline

A Qwen Cloud autopilot agent that turns one export product into reviewed B2B leads, evidence, scores, and first-touch email drafts.

## Selected Track

Track 4: Autopilot Agent

## One-Liner

Waimao Agent Platform automates repetitive foreign-trade lead research while keeping humans in the approval points that matter: search keywords and customer-facing outreach.

## What It Does

Foreign trade sales teams often spend hours manually translating product names, searching for importers, checking company websites, judging buyer fit, writing first-touch emails, and copying notes into a CRM. Waimao Agent Platform turns that workflow into a reviewed autopilot agent.

The user enters a product name and target markets. The system normalizes the product, generates B2B buyer-intent keywords, pauses for keyword approval, searches for candidate companies, merges evidence, scores buyer fit, drafts an email using only saved evidence, and pauses again for human email approval. The final output is not just a lead list; it is a reviewed CRM record with evidence, score, risks, suggested action, and a draft that a person can approve, save, or skip.

## How We Built It

We built the app with Next.js, React, TypeScript, Tailwind CSS, and LangGraph.js. LangGraph orchestrates the agent workflow as explicit nodes: normalize input, generate keywords, human keyword approval, search, extract company details, enrich companies, discover websites and contacts, merge evidence, score buyer fit, generate email drafts, human email approval, and save to CRM.

The platform has a provider layer for content models, search providers, storage, queues, and email. This keeps the agent workflow auditable and makes it possible to run a mock-safe local demo or switch to real provider mode through environment variables.

## How We Used Qwen Cloud

Qwen Cloud is the core reasoning model in the hackathon build. We use the DashScope OpenAI-compatible API through a dedicated Qwen provider selected by `CONTENT_MODEL_PROVIDER=qwen`.

Qwen is used for:

- Product-name normalization and translation.
- B2B buyer-intent keyword generation.
- Tool-search planning with structured JSON query plans.
- Buyer-fit scoring from saved evidence.
- First-touch email drafting using only stored evidence.

The application wraps Qwen responses in typed JSON normalization and fallback logic. Qwen proposes reasoning and draft content, while the application controls tool execution, evidence storage, review gates, and final actions.

## Why It Is An Autopilot Agent

The agent does not just chat. It advances a real business workflow across multiple steps, calls tools, records evidence, and changes application state. It can run the repetitive parts of export sales research end to end, but it stops at two human checkpoints:

- A reviewer must approve keywords before search begins.
- A reviewer must approve, save, or skip the email draft before outreach.

This makes the workflow practical for business use because the agent automates the tedious work while leaving commercial risk and customer-facing communication under human control.

## Alibaba Cloud Deployment

For the hackathon proof, the application is designed to run on Alibaba Cloud ECS or Simple Application Server with Qwen Cloud configured through environment variables.

Deployment proof package:

- Public app URL: `[TODO: add deployed URL]`
- Alibaba Cloud proof video or screenshots: `[TODO: add link]`
- Qwen Cloud model provider: `qwen-plus`
- API base URL: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
- Architecture diagram: `docs/architecture.svg`

## Demo Video

Video URL: `[TODO: upload outputs/waimao-qwen-3min-demo.mp4 to YouTube/Vimeo and paste URL]`

The video shows a product input, Qwen keyword generation, human keyword approval, LangGraph workflow execution, evidence-backed CRM scoring, Qwen email drafting, and human email review.

## Challenges

The hardest part was designing the boundary between useful automation and safe automation. B2B lead generation can easily become noisy or risky if an agent invents company facts, over-trusts weak evidence, or sends outreach too early. We solved this by making evidence explicit, keeping Qwen outputs structured, adding review nodes, and keeping email sending disabled until approval rules are satisfied.

Another challenge was making the workflow demoable without relying on private customer data or paid search accounts. The platform supports mock-safe mode while preserving the same workflow shape used for real provider mode.

## Accomplishments

- Built a multi-step LangGraph autopilot workflow for a real export-sales use case.
- Integrated Qwen Cloud as the reasoning provider for normalization, planning, scoring, and drafting.
- Added human review checkpoints for keywords and email drafts.
- Preserved evidence and risk notes in CRM records.
- Prepared a deployable hackathon version with environment templates, architecture diagram, and Devpost submission materials.

## What We Learned

The most useful business agents are not fully autonomous everywhere. They need autonomy in repetitive work, structure in tool use, and clear handoff points for human judgment. Qwen Cloud works well as the reasoning layer when the application provides strong workflow boundaries, typed outputs, and evidence-based prompts.

## What's Next

- Add a richer Alibaba Cloud production deployment with managed Redis and persistent database storage.
- Expand search-provider adapters and deduplication quality.
- Add multilingual email drafts for target markets.
- Add team review roles and audit dashboards.
- Add exportable CRM handoff packages for sales teams.

## Built With

Qwen Cloud, Alibaba Cloud, Next.js, React, TypeScript, LangGraph.js, Tailwind CSS, Supabase-ready storage, BullMQ-ready queue, Resend/SMTP-ready email provider.

## Repository

Repository URL: `https://github.com/yhaosen31-dot/waimao-qwen-hackathon`

License: MIT
