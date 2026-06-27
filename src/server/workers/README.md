# Workers

Reserved for background execution.

The MVP runs LangGraph synchronously inside the Next.js API route so it stays simple and transparent. A later version can move workflow execution to BullMQ, a LangGraph worker, or a dedicated NestJS worker without changing UI routes.
