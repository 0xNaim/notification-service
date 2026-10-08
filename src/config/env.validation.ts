import Joi from 'joi';

const smtpRequiredForWorker = (schema: Joi.StringSchema) =>
  schema.when('PROCESS_ROLE', {
    is: 'worker',
    then: Joi.required(),
    otherwise: Joi.optional(),
  });

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  PROCESS_ROLE: Joi.string().valid('api', 'worker').default('api'),

  PORT: Joi.number().port().default(3000),

  DATABASE_URL: Joi.string().uri().required(),

  RABBITMQ_URL: Joi.string().uri().required(),

  REDIS_URL: Joi.string().uri().required(),

  CORS_ORIGINS: Joi.string().allow('').default(''),

  // SMTP settings are only required by the worker, which sends the emails.
  SMTP_HOST: smtpRequiredForWorker(Joi.string()),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: smtpRequiredForWorker(Joi.string()),
  SMTP_PASS: smtpRequiredForWorker(Joi.string()),
  MAIL_FROM: smtpRequiredForWorker(Joi.string()),
});
