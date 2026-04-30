import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Text,
  VStack,
  Alert,
  AlertIcon,
  InputGroup,
  InputRightElement,
  IconButton,
  Heading,
  Flex,
} from '@chakra-ui/react'
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { signIn, user } = useAuth()
  const navigate = useNavigate()

  if (user) {
    navigate('/dashboard')
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signIn(email.trim().toLowerCase(), password)
    setLoading(false)
    if (error) {
      setError(error)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <Flex minH="100vh" align="center" justify="center" bg="gray.50">
      <Box bg="white" p={10} borderRadius="xl" shadow="md" w="full" maxW="420px" border="1px" borderColor="gray.100">
        <VStack spacing={6} align="stretch">
          <VStack spacing={1} align="center">
            <Heading size="lg" color="blue.700" letterSpacing="-0.5px">
              Batch Wise
            </Heading>
            <Text fontSize="sm" color="gray.500">
              Masai School — Internal Portal
            </Text>
          </VStack>

          {error && (
            <Alert status="error" borderRadius="md" fontSize="sm">
              <AlertIcon />
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <VStack spacing={4} align="stretch">
              <FormControl>
                <FormLabel fontSize="sm">Email address</FormLabel>
                <Input
                  type="email"
                  placeholder="you@masaischool.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  size="md"
                  autoComplete="email"
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">Password</FormLabel>
                <InputGroup>
                  <Input
                    type={showPwd ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    size="md"
                    autoComplete="current-password"
                  />
                  <InputRightElement>
                    <IconButton
                      aria-label="Toggle password"
                      icon={showPwd ? <ViewOffIcon /> : <ViewIcon />}
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowPwd(p => !p)}
                    />
                  </InputRightElement>
                </InputGroup>
              </FormControl>

              <Button
                type="submit"
                colorScheme="blue"
                isLoading={loading}
                loadingText="Signing in…"
                w="full"
                mt={2}
              >
                Sign in
              </Button>
            </VStack>
          </form>

          <Text fontSize="xs" color="gray.400" textAlign="center">
            Access restricted to @masaischool.com accounts
          </Text>
        </VStack>
      </Box>
    </Flex>
  )
}
