/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Body, Container, Head, Heading, Html, Img, Link, Section, Text } from '@react-email/components'
import * as React from 'react'
interface OTPVerificationEmailProps {
  otpCode: string
  title: string
}

const baseUrl = `https://tse1.mm.bing.net/th/id/OIP.JHC3MTK4T6fKf_EbSkNNbAHaHa?rs=1&pid=ImgDetMain&o=7&rm=3`

export const OTPVerificationEmail = ({ otpCode, title }: OTPVerificationEmailProps) => (
  <Html>
    <Head>{title}</Head>
    <Body style={main}>
      <Container style={container}>
        <Img src={`${baseUrl}`} width="212" height="88" alt="Company Logo" style={logo} />
        <Text style={tertiary}>Xác Thực Tài Khoản</Text>
        <Heading style={secondary}>Xin chào! Vui lòng nhập mã OTP bên dưới để xác thực tài khoản của bạn.</Heading>
        <Section style={codeContainer}>
          <Text style={code}>{otpCode}</Text>
        </Section>
        <Text style={paragraph}>Mã OTP này sẽ hết hạn sau 10 phút.</Text>
        <Text style={paragraph}>Không phải bạn yêu cầu email này?</Text>
        <Text style={paragraph}>
          Vui lòng liên hệ{' '}
          <Link href="mailto:support@yourcompany.com" style={link}>
            support@yourcompany.com
          </Link>{' '}
          nếu bạn không yêu cầu mã này.
        </Text>
      </Container>
      <Text style={footer}>Được bảo mật bởi hệ thống của chúng tôi.</Text>
    </Body>
  </Html>
)

OTPVerificationEmail.PreviewProps = {
  otpCode: '144833',
} as OTPVerificationEmailProps

export default OTPVerificationEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'HelveticaNeue,Helvetica,Arial,sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  border: '1px solid #eee',
  borderRadius: '5px',
  boxShadow: '0 5px 10px rgba(20,50,70,.2)',
  marginTop: '20px',
  maxWidth: '360px',
  margin: '0 auto',
  padding: '68px 0 130px',
}

const logo = {
  margin: '0 auto',
}

const tertiary = {
  color: '#0a85ea',
  fontSize: '11px',
  fontWeight: 700,
  fontFamily: 'HelveticaNeue,Helvetica,Arial,sans-serif',
  height: '16px',
  letterSpacing: '0',
  lineHeight: '16px',
  margin: '16px 8px 8px 8px',
  textTransform: 'uppercase' as const,
  textAlign: 'center' as const,
}

const secondary = {
  color: '#000',
  display: 'inline-block',
  fontFamily: 'HelveticaNeue-Medium,Helvetica,Arial,sans-serif',
  fontSize: '20px',
  fontWeight: 500,
  lineHeight: '24px',
  marginBottom: '0',
  marginTop: '0',
  textAlign: 'center' as const,
}

const codeContainer = {
  background: 'rgba(0,0,0,.05)',
  borderRadius: '4px',
  margin: '16px auto 14px',
  verticalAlign: 'middle',
  width: '280px',
}

const code = {
  color: '#000',
  display: 'inline-block',
  fontFamily: 'HelveticaNeue-Bold',
  fontSize: '32px',
  fontWeight: 700,
  letterSpacing: '6px',
  lineHeight: '40px',
  paddingBottom: '8px',
  paddingTop: '8px',
  margin: '0 auto',
  width: '100%',
  textAlign: 'center' as const,
}

const paragraph = {
  color: '#444',
  fontSize: '15px',
  fontFamily: 'HelveticaNeue,Helvetica,Arial,sans-serif',
  letterSpacing: '0',
  lineHeight: '23px',
  padding: '0 40px',
  margin: '0',
  textAlign: 'center' as const,
}

const link = {
  color: '#444',
  textDecoration: 'underline',
}

const footer = {
  color: '#000',
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '0',
  lineHeight: '23px',
  margin: '0',
  marginTop: '20px',
  fontFamily: 'HelveticaNeue,Helvetica,Arial,sans-serif',
  textAlign: 'center' as const,
  textTransform: 'uppercase' as const,
}
