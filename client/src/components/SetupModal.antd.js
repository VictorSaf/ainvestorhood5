import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  Space,
  Typography,
  Card,
  Steps,
  Alert,
  Divider,
  Spin,
  List,
  Tag,
  InputNumber,
  message
} from 'antd';
import {
  RobotOutlined,
  KeyOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { Option } = Select;
const { Step } = Steps;

const SetupModal = ({ visible, onClose, onComplete }) => {
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [aiProvider, setAiProvider] = useState('openai');
  const [ollamaModels, setOllamaModels] = useState([]);
  const [ollamaRunning, setOllamaRunning] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (visible) {
      // Always check Ollama models when modal opens, regardless of selected provider
      fetchOllamaModels();
      // Initialize form with current aiProvider state
      form.setFieldsValue({ aiProvider: aiProvider });
    }
  }, [visible, aiProvider, form]);

  // Also fetch when aiProvider changes to ollama
  useEffect(() => {
    if (aiProvider === 'ollama') {
      fetchOllamaModels();
    }
  }, [aiProvider]);

  const fetchOllamaModels = async () => {
    try {
      console.log('Fetching Ollama models...');
      const response = await fetch('http://localhost:8080/api/ollama/models');
      const data = await response.json();
      console.log('Ollama API response:', data);
      
      if (data.success && data.models) {
        setOllamaModels(data.models);
        setOllamaRunning(data.ollamaRunning);
        console.log('Ollama detected:', data.ollamaRunning, 'Models:', data.models.length);
      } else {
        setOllamaRunning(false);
        setOllamaModels([]);
        console.log('Ollama not detected or no models');
      }
    } catch (error) {
      console.error('Error fetching Ollama models:', error);
      setOllamaRunning(false);
    }
  };

  const testConnection = async (values) => {
    setTestingConnection(true);
    setTestResult(null);

    try {
      let endpoint = '';
      let payload = {};

      if (aiProvider === 'openai') {
        endpoint = '/api/openai/test';
        payload = { apiKey: values.apiKey };
      } else if (aiProvider === 'ollama') {
        endpoint = '/api/ollama/test';
        payload = { model: values.ollamaModel };
      }

      const response = await fetch(`http://localhost:8080${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      setTestResult(result);

      if (result.success) {
        message.success('Connection test successful!');
      } else {
        message.error(`Connection test failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      setTestResult({ success: false, error: error.message });
      message.error(`Connection test failed: ${error.message}`);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSubmit = async (values) => {
    setLoading(true);

    try {
      // Use aiProvider from state since FinalStep doesn't contain aiProvider field
      const payload = {
        aiProvider: aiProvider,
        ...values,
      };

      console.log('Setup payload being sent:', payload);
      console.log('aiProvider state:', aiProvider);
      console.log('aiProvider from form:', values.aiProvider);
      console.log('form values:', values);

      const response = await fetch('http://localhost:8080/api/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        message.success('Setup completed successfully!');
        if (onComplete) onComplete();
        if (onClose) onClose();
      } else {
        message.error(`Setup failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Setup error:', error);
      message.error(`Setup failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    {
      title: 'Choose AI Provider',
      description: 'Select your preferred AI service',
      icon: <RobotOutlined />
    },
    {
      title: 'Configure Settings',
      description: 'Set up your AI configuration',
      icon: <SettingOutlined />
    },
    {
      title: 'Complete Setup',
      description: 'Finish the configuration',
      icon: <CheckCircleOutlined />
    }
  ];

  const ProviderSelection = () => (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <div>
          <Title level={4}>Choose AI Provider</Title>
          <Paragraph type="secondary">
            Select the AI service you want to use for news analysis and chat functionality.
          </Paragraph>
        </div>

        <Form.Item name="aiProvider">
          <Select
            size="large"
            defaultValue="openai"
            value={aiProvider}
            onChange={(value) => {
              setAiProvider(value);
              form.setFieldsValue({ aiProvider: value });
            }}
            placeholder="Select AI Provider"
          >
            <Option value="openai">
              <Space>
                <RobotOutlined style={{ color: '#1890ff' }} />
                <div>
                  <Text strong>OpenAI</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    GPT-4, GPT-3.5 Turbo (Requires API Key)
                  </Text>
                </div>
              </Space>
            </Option>
            <Option value="ollama">
              <Space>
                <RobotOutlined style={{ color: '#52c41a' }} />
                <div>
                  <Text strong>Ollama</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    Local AI models (Free, requires Ollama installed)
                  </Text>
                </div>
              </Space>
            </Option>
          </Select>
        </Form.Item>

        <Button 
          type="primary" 
          onClick={() => setCurrentStep(1)}
          size="large"
          style={{ width: '100%' }}
        >
          Continue
        </Button>
      </Space>
    </Card>
  );

  const ConfigurationStep = () => (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <div>
          <Title level={4}>
            Configure {aiProvider === 'openai' ? 'OpenAI' : 'Ollama'}
          </Title>
          <Paragraph type="secondary">
            {aiProvider === 'openai' 
              ? 'Enter your OpenAI API key to enable AI features.'
              : 'Select an Ollama model for local AI processing.'
            }
          </Paragraph>
        </div>

        {aiProvider === 'openai' && (
          <Form.Item
            name="apiKey"
            label="OpenAI API Key"
            rules={[
              { required: true, message: 'Please enter your OpenAI API key' },
              { min: 20, message: 'API key seems too short' }
            ]}
          >
            <Input.Password
              size="large"
              prefix={<KeyOutlined />}
              placeholder="sk-..."
            />
          </Form.Item>
        )}

        {aiProvider === 'ollama' && (
          <>
            {!ollamaRunning && (
              <Alert
                message="Ollama Not Detected"
                description="Make sure Ollama is installed and running on your system."
                type="warning"
                showIcon
                icon={<ExclamationCircleOutlined />}
              />
            )}

            <Form.Item
              name="ollamaModel"
              label="Ollama Model"
              rules={[{ required: true, message: 'Please select an Ollama model' }]}
            >
              <Select
                size="large"
                placeholder="Select a model"
                disabled={!ollamaRunning}
                loading={!ollamaModels.length && ollamaRunning}
              >
                {ollamaModels.map((model) => (
                  <Option key={model.name} value={model.name}>
                    <Space direction="vertical" size="small">
                      <Text strong>{model.name}</Text>
                      <Text type="secondary" style={{ fontSize: '11px' }}>
                        Size: {model.size || 'Unknown'} | Modified: {
                          model.modified_at ? 
                          new Date(model.modified_at).toLocaleDateString() : 
                          'Unknown'
                        }
                      </Text>
                    </Space>
                  </Option>
                ))}
              </Select>
            </Form.Item>

            {ollamaRunning && (
              <Button 
                type="link" 
                onClick={fetchOllamaModels}
                icon={<LoadingOutlined />}
              >
                Refresh Models
              </Button>
            )}
          </>
        )}

        {/* Custom Prompt */}
        <Form.Item
          name="customPrompt"
          label="Custom System Prompt (Optional)"
        >
          <TextArea
            rows={4}
            placeholder="Enter a custom system prompt for the AI..."
          />
        </Form.Item>

        {/* Token Limits */}
        <Card size="small" title="Token Limits (Optional)">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Form.Item name={['tokenLimits', 'chat']} label="Chat" initialValue={1000}>
              <InputNumber min={100} max={4000} />
            </Form.Item>
            <Form.Item name={['tokenLimits', 'analysis']} label="Analysis" initialValue={800}>
              <InputNumber min={100} max={2000} />
            </Form.Item>
            <Form.Item name={['tokenLimits', 'streaming']} label="Streaming" initialValue={1000}>
              <InputNumber min={100} max={4000} />
            </Form.Item>
          </Space>
        </Card>

        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Button onClick={() => setCurrentStep(0)}>
            Back
          </Button>
          
          <Space>
            <Button 
              onClick={() => {
                form.validateFields().then(testConnection);
              }}
              loading={testingConnection}
              icon={<CheckCircleOutlined />}
            >
              Test Connection
            </Button>
            
            <Button 
              type="primary" 
              onClick={() => setCurrentStep(2)}
            >
              Continue
            </Button>
          </Space>
        </Space>

        {testResult && (
          <Alert
            message={testResult.success ? "Connection Successful" : "Connection Failed"}
            description={testResult.success ? 
              "Your AI provider is configured correctly!" : 
              testResult.error
            }
            type={testResult.success ? "success" : "error"}
            showIcon
            style={{ marginTop: 16 }}
          />
        )}
      </Space>
    </Card>
  );

  const FinalStep = () => (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <div style={{ textAlign: 'center' }}>
          <CheckCircleOutlined style={{ fontSize: '48px', color: '#52c41a' }} />
          <Title level={3}>Ready to Complete Setup</Title>
          <Paragraph type="secondary">
            Review your configuration and complete the setup process.
          </Paragraph>
        </div>

        <Card size="small" title="Configuration Summary">
          <List size="small">
            <List.Item>
              <Text strong>AI Provider:</Text> 
              <Tag color={aiProvider === 'openai' ? 'blue' : 'green'}>
                {aiProvider === 'openai' ? 'OpenAI' : 'Ollama'}
              </Tag>
            </List.Item>
            
            {aiProvider === 'openai' && (
              <List.Item>
                <Text strong>API Key:</Text> 
                <Text code>
                  {form.getFieldValue('apiKey') ? 
                    `${form.getFieldValue('apiKey').substring(0, 10)}...` : 
                    'Not set'
                  }
                </Text>
              </List.Item>
            )}
            
            {aiProvider === 'ollama' && (
              <List.Item>
                <Text strong>Model:</Text> 
                <Tag>{form.getFieldValue('ollamaModel') || 'Not selected'}</Tag>
              </List.Item>
            )}
            
            <List.Item>
              <Text strong>Custom Prompt:</Text> 
              <Text type="secondary">
                {form.getFieldValue('customPrompt') ? 'Configured' : 'Using default'}
              </Text>
            </List.Item>
          </List>
        </Card>

        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Button onClick={() => setCurrentStep(1)}>
            Back
          </Button>
          
          <Button 
            type="primary" 
            onClick={() => form.validateFields().then(handleSubmit)}
            loading={loading}
            size="large"
          >
            Complete Setup
          </Button>
        </Space>
      </Space>
    </Card>
  );

  // If no visible prop provided, assume it's always visible (for direct component usage)
  const isVisible = visible !== undefined ? visible : true;

  return (
    <Modal
      title="AIInvestorHood5 Setup"
      open={isVisible}
      onCancel={onClose}
      footer={null}
      width={800}
      destroyOnClose
      maskClosable={false}
    >
      <Form form={form} layout="vertical">
        <Steps current={currentStep} items={steps} style={{ marginBottom: 24 }} />
        
        {currentStep === 0 && <ProviderSelection />}
        {currentStep === 1 && <ConfigurationStep />}
        {currentStep === 2 && <FinalStep />}
      </Form>
    </Modal>
  );
};

export default SetupModal;