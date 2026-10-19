import * as yup from 'yup';

/**
 * Grundinformation never gives the errand a classification: the investigation document owns it. The
 * errand PATCH leaves classification alone, so the form asks only for what it renders.
 */
export const supportErrandFormSchema = yup
  .object({
    id: yup.string(),
    channel: yup.string().required('Välj kanal'),
    description: yup.string(),
    parameters: yup.array(),
  })
  .required();
