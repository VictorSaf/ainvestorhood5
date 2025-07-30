import React, { useState, useEffect, useRef } from 'react';
import {
  Layout,
  Card,
  Row,
  Col,
  Statistic,
  Button,
  Input,
  Space,
  Typography,
  Divider,
  Alert,
  Spin,
  Badge,
  Tag,
  List,
  Avatar,
  Tooltip,
  Progress,
  Descriptions,
  message
} from 'antd';
import {
  RobotOutlined,
  SendOutlined,
  ClearOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ApiOutlined,
  ClockCircleOutlined,
  MessageOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  DatabaseOutlined
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { io } from 'socket.io-client';
import 'highlight.js/styles/github-dark.css';

const { Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const AIDashboard = ({ onClose, integrated = false }) => {
  const [aiConfig, setAiConfig] = useState(null);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [modelDetails, setModelDetails] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [modelMetrics, setModelMetrics] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [socket, setSocket] = useState(null);
  const [streamingMessageId, setStreamingMessageId] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    loadAIConfig();
    loadOllamaModels();
    loadModelMetrics();
    
    // Initialize socket for streaming
    const newSocket = io('http://localhost:8080');
    setSocket(newSocket);
    
    // Listen for streaming chunks
    newSocket.on('ai-chat-chunk', (data) => {
      if (data.socketId === newSocket.id) {
        handleStreamChunk(data.chunk);
      }
    });
    
    // Listen for completion
    newSocket.on('ai-chat-complete', (data) => {
      if (data.socketId === newSocket.id) {
        handleStreamComplete(data);
      }
    });
    
    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadAIConfig = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/ai-config');
      const data = await response.json();
      setAiConfig(data);
      
      if (data.aiProvider === 'ollama' && data.ollamaModel) {
        loadModelDetails(data.ollamaModel);
      }
    } catch (error) {
      console.error('Error loading AI config:', error);
    }
  };

  const loadOllamaModels = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/ollama/models');
      const data = await response.json();
      if (data.success) {
        setOllamaModels(data.models);
      }
    } catch (error) {
      console.error('Error loading Ollama models:', error);
    }
  };

  const loadModelDetails = async (modelName) => {
    try {
      const response = await fetch('http://localhost:8080/api/ollama/model-details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: modelName }),
      });
      const data = await response.json();
      if (data.success) {
        setModelDetails(data.details);
      }
    } catch (error) {
      console.error('Error loading model details:', error);
    }
  };

  const loadModelMetrics = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/ai-metrics');
      const data = await response.json();
      setModelMetrics(data);
    } catch (error) {
      console.error('Error loading model metrics:', error);
    }
  };

  const testModel = async () => {
    if (!aiConfig) return;
    
    setIsLoading(true);
    try {
      let response;
      if (aiConfig.aiProvider === 'ollama') {
        response = await fetch('http://localhost:8080/api/ollama/test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model: aiConfig.ollamaModel }),
        });
      } else {
        response = await fetch('http://localhost:8080/api/openai/test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }
      const data = await response.json();
      setTestResult(data);
      
      if (data.success) {
        message.success('Model test successful!');
      } else {
        message.error(`Model test failed: ${data.error}`);
      }
    } catch (error) {
      const result = { success: false, error: error.message };
      setTestResult(result);
      message.error(`Model test failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const sendChatMessage = async () => {
    if (!inputMessage.trim() || !aiConfig || !socket) return;

    const userMessage = { role: 'user', content: inputMessage, timestamp: new Date() };
    setChatMessages(prev => [...prev, userMessage]);
    const messageText = inputMessage;
    setInputMessage('');
    setIsLoading(true);

    try {
      // Use streaming endpoint
      const response = await fetch('http://localhost:8080/api/ai-chat-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageText,
          aiProvider: aiConfig.aiProvider,
          model: aiConfig.ollamaModel,
          customPrompt: aiConfig.customPrompt,
          socketId: socket.id
        }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Streaming failed');
      }

      // The response will come through WebSocket events
      // handleStreamChunk and handleStreamComplete will handle it
      
    } catch (error) {
      const errorMessage = {
        role: 'assistant',
        content: `Error: ${error.message}`,
        timestamp: new Date(),
        isError: true
      };
      setChatMessages(prev => [...prev, errorMessage]);
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setChatMessages([]);
    message.info('Chat cleared');
  };

  const handleStreamChunk = (chunk) => {
    setChatMessages(prev => {
      const newMessages = [...prev];
      const lastMessage = newMessages[newMessages.length - 1];
      
      if (lastMessage && lastMessage.role === 'assistant' && lastMessage.streaming) {
        // Update the streaming message
        lastMessage.content += chunk;
      } else {
        // Create new streaming message
        newMessages.push({
          role: 'assistant',
          content: chunk,
          timestamp: new Date(),
          streaming: true
        });
      }
      
      return newMessages;
    });
  };

  const handleStreamComplete = (data) => {
    setChatMessages(prev => {
      const newMessages = [...prev];
      const lastMessage = newMessages[newMessages.length - 1];
      
      if (lastMessage && lastMessage.role === 'assistant' && lastMessage.streaming) {
        // Mark as complete and add metadata
        lastMessage.streaming = false;
        lastMessage.processingTime = data.processingTime;
        lastMessage.tokens = data.tokens;
      }
      
      return newMessages;
    });
    
    setIsLoading(false);
    setStreamingMessageId(null);
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderMessage = (msg, index) => {
    const isUser = msg.role === 'user';
    
    return (
      <div
        key={index}
        style={{
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
          marginBottom: 16
        }}
      >
        <div
          style={{
            maxWidth: '70%',
            padding: '12px 16px',
            borderRadius: 12,
            backgroundColor: isUser ? '#1890ff' : msg.isError ? '#fff2f0' : '#f0f0f0',
            color: isUser ? '#fff' : msg.isError ? '#a8071a' : '#000',
            border: msg.isError ? '1px solid #ffccc7' : 'none'
          }}
        >
          {msg.role === 'assistant' && !msg.isError ? (
            <div style={{ fontSize: '14px' }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  code: ({node, inline, className, children, ...props}) => {
                    if (inline) {
                      return (
                        <code 
                          style={{ 
                            backgroundColor: 'rgba(0,0,0,0.1)', 
                            padding: '2px 4px', 
                            borderRadius: 4,
                            fontSize: '12px',
                            fontFamily: 'monospace'
                          }} 
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    }
                    return (
                      <pre style={{ 
                        backgroundColor: '#1f1f1f', 
                        color: '#f0f0f0', 
                        padding: 12, 
                        borderRadius: 8, 
                        overflowX: 'auto' 
                      }}>
                        <code className={className} {...props}>
                          {children}
                        </code>
                      </pre>
                    );
                  }
                }}
              >
                {msg.content}
              </ReactMarkdown>
              {msg.streaming && (
                <span style={{ 
                  display: 'inline-block', 
                  width: 8, 
                  height: 16, 
                  backgroundColor: '#666', 
                  animation: 'pulse 1s infinite',
                  marginLeft: 4 
                }} />
              )}
            </div>
          ) : (
            <Text style={{ fontSize: '14px', color: isUser ? '#fff' : msg.isError ? '#a8071a' : '#000' }}>
              {msg.content}
            </Text>
          )}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            marginTop: 8, 
            fontSize: '12px', 
            opacity: 0.75 
          }}>
            <span>{msg.timestamp.toLocaleTimeString()}</span>
            {msg.processingTime && (
              <span>{msg.processingTime}ms</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (!aiConfig) {
    return (
      <div style={{ padding: '50px', textAlign: 'center' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text>Loading AI configuration...</Text>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ 
        padding: '16px 24px', 
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <RobotOutlined style={{ fontSize: 24, color: '#1890ff' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>AI Dashboard</Title>
            <Text type="secondary">
              {aiConfig.aiProvider === 'ollama' ? 'Local Ollama Model' : 'OpenAI GPT-4'}
            </Text>
          </div>
        </div>
        <Badge status={aiConfig.aiProvider === 'ollama' ? "success" : "processing"} text="Connected" />
      </div>

      <Row style={{ flex: 1, overflow: 'hidden' }}>
        {/* Left Panel - Model Details & Settings */}
        <Col span={12} style={{ 
          padding: 24, 
          borderRight: '1px solid #f0f0f0', 
          overflowY: 'auto',
          height: '100%'
        }}>
          {/* Model Information */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <Title level={5}>
              <ApiOutlined /> Model Information
            </Title>
            
            {aiConfig.aiProvider === 'ollama' ? (
              <Descriptions size="small" column={1}>
                <Descriptions.Item label="Provider">
                  <Tag color="blue">Ollama (Local)</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Model">
                  <Text strong>{aiConfig.ollamaModel}</Text>
                </Descriptions.Item>
                {ollamaModels.length > 0 && (
                  <Descriptions.Item label="Available Models">
                    <div style={{ marginTop: 8 }}>
                      {ollamaModels.map((model, index) => (
                        <div key={index} style={{ 
                          padding: '4px 8px',
                          backgroundColor: '#f0f0f0',
                          borderRadius: 4,
                          marginBottom: 4,
                          display: 'flex',
                          justifyContent: 'space-between'
                        }}>
                          <Text strong>{model.name}</Text>
                          <Text type="secondary">{formatBytes(model.size)}</Text>
                        </div>
                      ))}
                    </div>
                  </Descriptions.Item>
                )}
              </Descriptions>
            ) : (
              <Descriptions size="small" column={1}>
                <Descriptions.Item label="Provider">
                  <Tag color="green">OpenAI</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Model">
                  <Text strong>GPT-4</Text>
                </Descriptions.Item>
                <Descriptions.Item label="API Key Status">
                  <Badge 
                    status={aiConfig.hasOpenAIKey ? "success" : "error"} 
                    text={aiConfig.hasOpenAIKey ? 'Configured' : 'Not configured'} 
                  />
                </Descriptions.Item>
              </Descriptions>
            )}
          </Card>

          {/* Agent Settings */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <Title level={5}>
              <SettingOutlined /> Agent Settings
            </Title>
            
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text strong>Custom Prompt:</Text>
                <div style={{ 
                  marginTop: 8,
                  padding: 8,
                  backgroundColor: '#f0f0f0',
                  borderRadius: 4,
                  maxHeight: 120,
                  overflow: 'auto'
                }}>
                  <Text style={{ fontSize: '12px' }}>
                    {aiConfig.customPrompt || 'Using default financial analysis prompt'}
                  </Text>
                </div>
              </div>
              
              {modelMetrics && (
                <Row gutter={16}>
                  <Col span={12}>
                    <Statistic
                      title="Total Requests"
                      value={modelMetrics.totalRequests}
                      prefix={<MessageOutlined />}
                      valueStyle={{ color: '#722ed1' }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="Avg Response Time"
                      value={modelMetrics.avgResponseTime}
                      suffix="ms"
                      prefix={<ClockCircleOutlined />}
                      valueStyle={{ color: '#722ed1' }}
                    />
                  </Col>
                </Row>
              )}
            </Space>
          </Card>

          {/* Model Test */}
          <Card size="small">
            <Title level={5}>
              <ThunderboltOutlined /> Model Test
            </Title>
            
            <Button
              type="primary"
              block
              onClick={testModel}
              loading={isLoading}
              icon={<CheckCircleOutlined />}
              style={{ marginBottom: 16 }}
            >
              Test Model Connection
            </Button>

            {testResult && (
              <Alert
                message={testResult.success ? 'Model Test Successful' : 'Model Test Failed'}
                description={testResult.response || testResult.error}
                type={testResult.success ? 'success' : 'error'}
                showIcon
              />
            )}
          </Card>
        </Col>

        {/* Right Panel - Chat Interface */}
        <Col span={12} style={{ 
          display: 'flex', 
          flexDirection: 'column',
          height: '100%'
        }}>
          {/* Chat Header */}
          <div style={{ 
            padding: '16px 24px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <Title level={5} style={{ margin: 0 }}>
              <MessageOutlined /> Agent Chat Test
            </Title>
            <Button 
              type="text" 
              size="small"
              onClick={clearChat}
              icon={<ClearOutlined />}
            >
              Clear Chat
            </Button>
          </div>

          {/* Chat Messages */}
          <div style={{ 
            flex: 1, 
            overflowY: 'auto', 
            padding: '16px 24px'
          }}>
            {chatMessages.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                color: '#999', 
                marginTop: 60 
              }}>
                <MessageOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                <p>Start a conversation to test the AI agent</p>
              </div>
            ) : (
              <div>
                {chatMessages.map(renderMessage)}
                
                {isLoading && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{ 
                      backgroundColor: '#f0f0f0',
                      borderRadius: 12,
                      padding: '12px 16px'
                    }}>
                      <Space>
                        <Spin size="small" />
                        <Text type="secondary">AI is thinking...</Text>
                      </Space>
                    </div>
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {/* Chat Input */}
          <div style={{ 
            padding: '16px 24px',
            borderTop: '1px solid #f0f0f0'
          }}>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onPressEnter={sendChatMessage}
                placeholder="Type your message to test the AI agent..."
                disabled={isLoading}
                style={{ flex: 1 }}
              />
              <Button
                type="primary"
                onClick={sendChatMessage}
                disabled={isLoading || !inputMessage.trim()}
                icon={<SendOutlined />}
              />
            </Space.Compact>
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default AIDashboard;