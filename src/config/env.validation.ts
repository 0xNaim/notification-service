import Joi from 'joi';

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
});
