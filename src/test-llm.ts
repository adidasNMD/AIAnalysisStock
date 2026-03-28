import { generateTextCompletion } from './utils/llm';

async function testLLM() {
  console.log('正在测试 LLM 连通性...');
  try {
    const result = await generateTextCompletion(
      '你是一个友好的助手。',
      '请回复"API 连接成功！"这几个字，不需要其他内容。'
    );
    console.log('✅ 测试成功，模型回复：', result);
  } catch (err: any) {
    console.error('❌ 测试失败：', err.message);
  }
}

testLLM();
